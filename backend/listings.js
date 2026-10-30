import express from 'express';
import { pool } from './db.js';
import { effectivePlan } from './plans.js';

// หน้า "หาก๊วน" — เจ้าของก๊วนเปิดประกาศรับสมาชิกได้ (วัน/เวลา/สถานที่/ระดับมือ)
// ข้อมูลสาธารณะไม่ส่ง id (รหัสเข้าก๊วน) ออกไป — คนที่สนใจติดต่อผ่านช่องทางที่เจ้าของก๊วนใส่ไว้

const RANKS = ['P+', 'P', 'P-', 'N', 'S3', 'S2', 'S1', 'S-3', 'S-2', 'S-1', 'BG3', 'BG2', 'BG1', 'VIP3', 'VIP2', 'VIP1'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const str = (v, max) => String(v ?? '').trim().slice(0, max);

// รับข้อความที่แชร์จาก Google Maps ได้หลายแบบ: ลิงก์เฉยๆ, "ชื่อสถานที่ + ลิงก์" ที่ปุ่มแชร์ของมือถือสร้างให้,
// หรือพิกัด "13.7563, 100.5018" → คืนลิงก์ที่เปิดแผนที่ได้ ('' = ว่าง, null = อ่านไม่ออก)
export function normalizeMapUrl(input) {
  const text = String(input ?? '').trim();
  if (!text) return '';
  const url = text.match(/https?:\/\/[^\s<>"']+/i);
  if (url) return url[0].replace(/[.,;)\]]+$/, '').slice(0, 300);
  const c = text.match(/(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (c) {
    const lat = Number(c[1]), lng = Number(c[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  return null;
}

function parseJson(text, fallback) {
  // JSON.parse(null) คืน null โดยไม่ throw (ก๊วนที่ยังไม่เคยบันทึกประกาศ) — ใช้ค่า fallback แทน
  try { return JSON.parse(text) ?? fallback; } catch { return fallback; }
}

function toDto(row) {
  return {
    name: row.name,
    description: row.description || '',
    venue: row.venue || '',
    area: row.area || '',
    mapUrl: row.map_url || '',
    schedule: parseJson(row.schedule, []),
    levels: parseJson(row.levels, []),
    price: row.price || '',
    contact: row.contact || '',
    updatedAt: Number(row.updated_at),
  };
}

// อ่าน/ตรวจค่าที่เจ้าของก๊วนส่งมา — คืน null ถ้าไม่ผ่าน
function sanitize(body) {
  const b = body || {};
  const schedule = [];
  for (const s of Array.isArray(b.schedule) ? b.schedule.slice(0, 7) : []) {
    const day = Number(s?.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) return null;
    const end = s.end ? s.end : '';  // เวลาจบเว้นว่างได้ = "เป็นต้นไป"
    if (!TIME_RE.test(s.start) || (end && !TIME_RE.test(end))) return null;
    schedule.push({ day, start: s.start, end });
  }
  const levels = (Array.isArray(b.levels) ? b.levels : []).filter(l => RANKS.includes(l));
  const mapUrl = normalizeMapUrl(b.mapUrl);
  if (mapUrl === null) return null;
  return {
    listed: b.listed ? 1 : 0,
    description: str(b.description, 500),
    venue: str(b.venue, 150),
    area: str(b.area, 80),
    mapUrl,
    schedule: JSON.stringify(schedule),
    levels: JSON.stringify([...new Set(levels)]),
    price: str(b.price, 100),
    contact: str(b.contact, 200),
  };
}

// ── สาธารณะ: GET /api/listings?day=0-6&level=S1&q=ข้อความ ──
export const listings = express.Router();
listings.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT g.name, l.* FROM group_listings l
       JOIN \`groups\` g ON g.id = l.group_id
       WHERE l.listed = 1 AND g.status = 'active'
       ORDER BY l.updated_at DESC LIMIT 200`
    );
    let out = rows.map(toDto);
    const day = req.query.day === undefined || req.query.day === '' ? null : Number(req.query.day);
    if (day !== null && Number.isInteger(day)) out = out.filter(g => g.schedule.some(s => s.day === day));
    const level = String(req.query.level || '');
    if (RANKS.includes(level)) out = out.filter(g => g.levels.length === 0 || g.levels.includes(level));
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q) out = out.filter(g => `${g.name} ${g.venue} ${g.area} ${g.description}`.toLowerCase().includes(q));
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── เจ้าของก๊วน (ผ่าน group token): GET/PUT /api/g/:gid/listing ──
export function mountGroupListing(r) {
  r.get('/listing', async (req, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT g.name, l.* FROM `groups` g LEFT JOIN group_listings l ON l.group_id = g.id WHERE g.id = ?',
        [req.params.gid]
      );
      const row = rows[0];
      if (!row) return res.status(404).json({ error: 'group_not_found' });
      res.json({ listed: !!row.listed, ...toDto({ ...row, updated_at: row.updated_at || 0 }) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  r.put('/listing', async (req, res) => {
    const v = sanitize(req.body);
    if (!v) return res.status(400).json({ error: 'invalid_listing' });
    if (v.listed && (!v.venue || JSON.parse(v.schedule).length === 0)) {
      return res.status(400).json({ error: 'listing_incomplete' });
    }
    try {
      if (v.listed) {
        const [[g]] = await pool.query('SELECT owner_id FROM `groups` WHERE id = ?', [req.params.gid]);
        if (!(await effectivePlan(g?.owner_id)).plan.features.listing) {
          return res.status(403).json({ error: 'plan_limit', message: 'แพ็กเกจของคุณไม่รองรับการเปิดประกาศหาสมาชิก' });
        }
      }
      await pool.query(
        `INSERT INTO group_listings (group_id, listed, description, venue, area, map_url, schedule, levels, price, contact, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE listed = VALUES(listed), description = VALUES(description), venue = VALUES(venue),
           area = VALUES(area), map_url = VALUES(map_url), schedule = VALUES(schedule), levels = VALUES(levels),
           price = VALUES(price), contact = VALUES(contact), updated_at = VALUES(updated_at)`,
        [req.params.gid, v.listed, v.description, v.venue, v.area, v.mapUrl, v.schedule, v.levels, v.price, v.contact, Date.now()]
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server_error' });
    }
  });
}
