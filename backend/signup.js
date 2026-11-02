import crypto from 'crypto';
import { pool } from './db.js';
import { effectivePlan } from './plans.js';

// ลงชื่อล่วงหน้าผ่านลิงก์สาธารณะ: ครบจำนวนที่นั่งแล้วคนถัดไปเข้าคิวสำรองอัตโนมัติ (เรียงตามเวลาที่ลงชื่อ)
export async function ensureSignupTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_signup (
      group_id VARCHAR(40) PRIMARY KEY,
      is_open BOOLEAN NOT NULL DEFAULT false,
      capacity INT NOT NULL DEFAULT 16,
      title VARCHAR(120) NULL,
      note VARCHAR(300) NULL,
      updated_at BIGINT NOT NULL DEFAULT 0,
      FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signup_entries (
      id VARCHAR(40) PRIMARY KEY,
      group_id VARCHAR(40) NOT NULL,
      name VARCHAR(40) NOT NULL,
      contact VARCHAR(60) NULL,
      cancel_token VARCHAR(64) NOT NULL,
      created_at BIGINT NOT NULL,
      INDEX idx_signup_group (group_id, created_at),
      FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
    )
  `);
}

const wrap = (fn) => (req, res) => fn(req, res).catch(err => { console.error(err); res.status(500).json({ error: 'server_error' }); });

const hits = new Map();
const throttle = (max, windowMs) => (req, res, next) => {
  const key = `${req.method}|${req.params.gid}|${req.ip}`;
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || rec.resetAt <= now) hits.set(key, { count: 1, resetAt: now + windowMs });
  else if (++rec.count > max) return res.status(429).json({ error: 'too_many_attempts' });
  next();
};

const MAX_ENTRIES = 200;

async function loadSignup(gid) {
  const [[cfg]] = await pool.query('SELECT * FROM group_signup WHERE group_id = ?', [gid]);
  const [entries] = await pool.query('SELECT id, name, contact, created_at FROM signup_entries WHERE group_id = ? ORDER BY created_at, id', [gid]);
  const capacity = cfg ? cfg.capacity : 16;
  return {
    open: !!cfg?.is_open, capacity, title: cfg?.title || '', note: cfg?.note || '',
    entries: entries.map((e, i) => ({ id: e.id, name: e.name, contact: e.contact || '', createdAt: Number(e.created_at), status: i < capacity ? 'confirmed' : 'waitlist', position: i + 1 })),
  };
}

// สาธารณะ — ไม่ส่งเบอร์ติดต่อ/โทเคนยกเลิกของใครออกไป
export function mountPublicSignup(pub) {
  pub.get('/signup', wrap(async (req, res) => {
    const [[g]] = await pool.query('SELECT name, status FROM `groups` WHERE id = ?', [req.params.gid]);
    if (!g || g.status === 'suspended') return res.status(404).json({ error: 'group_not_found' });
    const s = await loadSignup(req.params.gid);
    res.json({
      groupName: g.name, open: s.open, capacity: s.capacity, title: s.title, note: s.note,
      entries: s.entries.map(({ id, name, status, position }) => ({ id, name, status, position })),
    });
  }));

  pub.post('/signup', throttle(20, 60 * 60 * 1000), wrap(async (req, res) => {
    const gid = req.params.gid;
    const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
    const contact = String(req.body?.contact || '').trim().slice(0, 60);
    if (!name || name.length > 30) return res.status(400).json({ error: 'invalid_name' });
    const s = await loadSignup(gid);
    const [[g]] = await pool.query('SELECT status FROM `groups` WHERE id = ?', [gid]);
    if (!g || g.status === 'suspended') return res.status(404).json({ error: 'group_not_found' });
    if (!s.open) return res.status(403).json({ error: 'closed' });
    if (s.entries.length >= MAX_ENTRIES) return res.status(403).json({ error: 'full' });
    if (s.entries.some(e => e.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ error: 'duplicate' });
    const id = crypto.randomBytes(8).toString('hex');
    const cancelToken = crypto.randomBytes(16).toString('hex');
    await pool.query('INSERT INTO signup_entries (id, group_id, name, contact, cancel_token, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, gid, name, contact || null, cancelToken, Date.now()]);
    const position = s.entries.length + 1;
    res.json({ id, cancelToken, position, status: position <= s.capacity ? 'confirmed' : 'waitlist' });
  }));

  pub.delete('/signup/:id', throttle(60, 60 * 60 * 1000), wrap(async (req, res) => {
    const [r] = await pool.query('DELETE FROM signup_entries WHERE id = ? AND group_id = ? AND cancel_token = ?', [req.params.id, req.params.gid, String(req.query.token || '')]);
    if (r.affectedRows === 0) return res.status(403).json({ error: 'forbidden' });
    res.json({ ok: true });
  }));
}

// เจ้าของ/ผู้ช่วย (ต้องมี token ก๊วน)
export function mountGroupSignup(r) {
  r.get('/signup/admin', wrap(async (req, res) => res.json(await loadSignup(req.params.gid))));

  r.put('/signup/config', wrap(async (req, res) => {
    const gid = req.params.gid;
    const b = req.body || {};
    const [[g]] = await pool.query('SELECT owner_id FROM `groups` WHERE id = ?', [gid]);
    const { plan } = await effectivePlan(g?.owner_id);
    let capacity = Math.floor(Number(b.capacity));
    if (!Number.isFinite(capacity) || capacity < 1) return res.status(400).json({ error: 'invalid_capacity' });
    if (plan.maxPlayers != null) capacity = Math.min(capacity, plan.maxPlayers);
    capacity = Math.min(capacity, 200);
    await pool.query(
      'INSERT INTO group_signup (group_id, is_open, capacity, title, note, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE is_open = VALUES(is_open), capacity = VALUES(capacity), title = VALUES(title), note = VALUES(note), updated_at = VALUES(updated_at)',
      [gid, !!b.open, capacity, String(b.title || '').trim().slice(0, 120) || null, String(b.note || '').trim().slice(0, 300) || null, Date.now()]
    );
    res.json({ capacity });
  }));

  r.delete('/signup/entry/:id', wrap(async (req, res) => {
    await pool.query('DELETE FROM signup_entries WHERE id = ? AND group_id = ?', [req.params.id, req.params.gid]);
    res.json({ ok: true });
  }));

  r.post('/signup/clear', wrap(async (req, res) => {
    await pool.query('DELETE FROM signup_entries WHERE group_id = ?', [req.params.gid]);
    res.json({ ok: true });
  }));
}
