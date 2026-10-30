import crypto from 'crypto';
import express from 'express';
import nodemailer from 'nodemailer';
import { pool } from './db.js';
import { hashPin, verifyPin, issueToken, issueUserToken, hashSecret, userIdFromRequest } from './auth.js';

// ───────────────────────── ตั้งค่า (.env) ─────────────────────────
// ADMIN_EMAIL : อีเมลที่สมัครแล้วจะได้เป็นแอดมินระบบ (ต้องยืนยันอีเมลก่อนเหมือนคนอื่น)
// APP_URL     : URL ของเว็บที่ใช้ในลิงก์ยืนยัน (เช่น https://smashpang.example.com)
// SMTP_*      : ส่งอีเมลยืนยัน — ไม่ตั้ง = ไม่ส่งจริง (dev จะคืนลิงก์ให้ในผลลัพธ์แทน)
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const IS_PROD = process.env.NODE_ENV === 'production';
const smtpReady = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const mailer = smtpReady
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

// สมัครด้วย Gmail เท่านั้น
const EMAIL_RE = /^[a-z0-9._%+-]+@gmail\.com$/i;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,20}$/;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const GROUP_ID_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;
const PIN_RE = /^\d{4,8}$/;

const newId = () => crypto.randomBytes(10).toString('hex');
const baseUrl = (req) => APP_URL || `${req.protocol}://${req.get('host')}`;

export const publicConfig = () => ({ emailEnabled: smtpReady });

const userDto = (u) => ({ id: u.id, email: u.email, username: u.username, displayName: u.display_name, role: u.role, status: u.status });

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

// ───────────────────────── ส่งลิงก์ยืนยัน ─────────────────────────
async function sendVerification(req, user) {
  const raw = crypto.randomBytes(24).toString('base64url');
  await pool.query('DELETE FROM verifications WHERE user_id = ?', [user.id]);
  await pool.query('INSERT INTO verifications (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [hashSecret(raw), user.id, Date.now() + VERIFY_TTL_MS]);
  const link = `${baseUrl(req)}/?verify=${raw}`;
  if (mailer) {
    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: 'ยืนยันอีเมล SmashPang',
      text: `สวัสดี ${user.display_name}\n\nกดลิงก์เพื่อยืนยันอีเมลและเปิดใช้งานบัญชี (หมดอายุใน 24 ชั่วโมง):\n${link}\n`,
    });
    return {};
  }
  console.log(`📧 [dev] ลิงก์ยืนยันของ ${user.email}: ${link}`);
  // ไม่ได้ตั้ง SMTP: คืนลิงก์ให้ใช้ทดสอบ (ไม่ทำใน production)
  return IS_PROD ? {} : { devLink: link };
}

// ───────────────────────── middleware ─────────────────────────
async function loadUser(req, res, next) {
  const uid = userIdFromRequest(req);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [uid]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  if (user.status !== 'active') return res.status(403).json({ error: user.status === 'pending' ? 'not_verified' : 'suspended' });
  req.user = user;
  next();
}

const requireAdmin = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'forbidden' });

// กัน brute force / สแปมสมัคร ต่อ IP
const hits = new Map();
const throttle = (max, windowMs) => (req, res, next) => {
  const key = `${req.path}|${req.ip}`;
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || rec.resetAt <= now) hits.set(key, { count: 1, resetAt: now + windowMs });
  else if (++rec.count > max) return res.status(429).json({ error: 'too_many_attempts' });
  next();
};

// ───────────────────────── /api/auth ─────────────────────────
export const auth = express.Router();

auth.post('/register', throttle(10, 60 * 60 * 1000), wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const username = String(req.body?.username || '').trim();
  if (!EMAIL_RE.test(email) || email.length > 190) return res.status(400).json({ error: 'invalid_email' });
  if (password.length < 8 || password.length > 100) return res.status(400).json({ error: 'weak_password' });
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'invalid_username' });

  const [nameTaken] = await pool.query('SELECT id FROM users WHERE username = ? AND email <> ?', [username, email]);
  if (nameTaken.length > 0) return res.status(409).json({ error: 'username_taken' });
  const [exist] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  if (exist.length > 0) {
    // สมัครค้างไว้ยังไม่ยืนยัน → ส่งลิงก์ใหม่ให้ แต่ไม่เปลี่ยนรหัสผ่านของบัญชีเดิม
    if (exist[0].status === 'pending') return res.json({ ok: true, ...(await sendVerification(req, exist[0])) });
    return res.status(409).json({ error: 'email_taken' });
  }
  const user = { id: newId(), email, display_name: username, role: email === ADMIN_EMAIL ? 'admin' : 'owner' };
  await pool.query(
    "INSERT INTO users (id, email, username, password_hash, display_name, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
    [user.id, email, username, hashPin(password), username, user.role, Date.now()]
  );
  res.json({ ok: true, ...(await sendVerification(req, user)) });
}));

auth.post('/resend', throttle(5, 60 * 60 * 1000), wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const [rows] = await pool.query("SELECT * FROM users WHERE email = ? AND status = 'pending'", [email]);
  // ตอบเหมือนกันเสมอ ไม่บอกว่าอีเมลนี้มีในระบบหรือไม่
  const extra = rows[0] ? await sendVerification(req, rows[0]) : {};
  res.json({ ok: true, ...extra });
}));

// ยืนยันอีเมลจากลิงก์ → เปิดใช้งานบัญชี + ล็อกอินให้เลย
auth.post('/verify', throttle(30, 60 * 60 * 1000), wrap(async (req, res) => {
  const hash = hashSecret(String(req.body?.token || ''));
  const [rows] = await pool.query('SELECT user_id, expires_at FROM verifications WHERE token_hash = ?', [hash]);
  if (rows.length === 0 || rows[0].expires_at < Date.now()) return res.status(400).json({ error: 'invalid_or_expired' });
  await pool.query("UPDATE users SET status = 'active' WHERE id = ? AND status = 'pending'", [rows[0].user_id]);
  await pool.query('DELETE FROM verifications WHERE token_hash = ?', [hash]);
  res.json({ ok: true, token: issueUserToken(rows[0].user_id) });
}));

auth.post('/login', throttle(15, 10 * 60 * 1000), wrap(async (req, res) => {
  const ident = String(req.body?.identifier || '').trim();
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ? OR email = ?', [ident, ident.toLowerCase()]);
  const user = rows[0];
  if (!user || !user.password_hash || !verifyPin(String(req.body?.password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'wrong_credentials' });
  }
  if (user.status === 'pending') return res.status(403).json({ error: 'not_verified' });
  if (user.status === 'suspended') return res.status(403).json({ error: 'suspended' });
  res.json({ token: issueUserToken(user.id), user: userDto(user) });
}));

// ───────────────────────── /api/me (เจ้าของก๊วน) ─────────────────────────
export const me = express.Router();
me.use(wrap(loadUser));

me.get('/', (req, res) => res.json(userDto(req.user)));

me.get('/groups', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, status, created_at FROM `groups` WHERE owner_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json(rows.map(g => ({ id: g.id, name: g.name, status: g.status, createdAt: Number(g.created_at) })));
}));

// สร้างก๊วน (ต้องเป็นสมาชิกที่ยืนยันแล้ว) — รูปแบบก๊วนเลือกในระบบตอนเริ่มแต่ละวัน
me.post('/groups', wrap(async (req, res) => {
  const { id, pin } = req.body || {};
  if (typeof id !== 'string' || !GROUP_ID_RE.test(id)) return res.status(400).json({ error: 'invalid_id' });
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) return res.status(400).json({ error: 'invalid_pin' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [exists] = await conn.query('SELECT id FROM `groups` WHERE id = ?', [id]);
    if (exists.length > 0) { await conn.rollback(); return res.status(409).json({ error: 'id_taken' }); }
    await conn.query(
      'INSERT INTO `groups` (id, name, pin_hash, pin_length, created_at, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
      // ชื่อก๊วนตั้งในระบบตอนเข้าครั้งแรก — ระหว่างนั้นใช้รหัสก๊วนเป็นชื่อชั่วคราว
      [id, id, hashPin(pin), pin.length, Date.now(), req.user.id]
    );
    await conn.query('INSERT INTO settings (group_id) VALUES (?)', [id]);
    await conn.query('INSERT INTO state_meta (group_id, version) VALUES (?, 0)', [id]);
    await conn.commit();
    res.json({ id });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

// เจ้าของก๊วน (หรือแอดมินระบบ) เข้าก๊วนได้โดยไม่ต้องใส่ PIN
me.post('/groups/:gid/enter', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT owner_id, status FROM `groups` WHERE id = ?', [req.params.gid]);
  const g = rows[0];
  if (!g) return res.status(404).json({ error: 'group_not_found' });
  if (g.owner_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  if (g.status === 'suspended' && req.user.role !== 'admin') return res.status(403).json({ error: 'group_suspended' });
  res.json({ token: issueToken(req.params.gid) });
}));

// ───────────────────────── /api/admin (แอดมินระบบ) ─────────────────────────
export const admin = express.Router();
admin.use(wrap(loadUser), requireAdmin);

admin.get('/overview', wrap(async (req, res) => {
  const [[u]] = await pool.query("SELECT COUNT(*) AS n, SUM(status='pending') AS pending, SUM(status='suspended') AS suspended FROM users");
  const [[g]] = await pool.query("SELECT COUNT(*) AS n, SUM(status='suspended') AS suspended FROM `groups`");
  res.json({ users: Number(u.n), pendingUsers: Number(u.pending || 0), suspendedUsers: Number(u.suspended || 0), groups: Number(g.n), suspendedGroups: Number(g.suspended || 0) });
}));

admin.get('/users', wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT u.*, (SELECT COUNT(*) FROM `groups` g WHERE g.owner_id = u.id) AS group_count FROM users u ORDER BY u.created_at DESC'
  );
  res.json(rows.map(u => ({ ...userDto(u), groupCount: Number(u.group_count), createdAt: Number(u.created_at) })));
}));

// active = ยืนยันให้ด้วยมือ (กรณีอีเมลไม่ถึง) / ปลดระงับ · suspended = ระงับ
admin.patch('/users/:id', wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'cannot_modify_self' });
  await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ ok: true });
}));

admin.delete('/users/:id', wrap(async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'cannot_modify_self' });
  // ก๊วนของผู้ใช้ไม่ถูกลบ — แค่หลุดเจ้าของ (แอดมินจัดการต่อได้)
  await pool.query('UPDATE `groups` SET owner_id = NULL WHERE owner_id = ?', [req.params.id]);
  await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

admin.get('/groups', wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT g.id, g.name, g.status, g.created_at, u.display_name AS owner_name, u.email AS owner_email FROM `groups` g LEFT JOIN users u ON u.id = g.owner_id ORDER BY g.created_at DESC'
  );
  res.json(rows.map(g => ({ id: g.id, name: g.name, status: g.status, createdAt: Number(g.created_at), ownerName: g.owner_name, ownerEmail: g.owner_email })));
}));

admin.patch('/groups/:id', wrap(async (req, res) => {
  const { status, name, pin } = req.body || {};
  const sets = []; const vals = [];
  if (status !== undefined) { if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'invalid_status' }); sets.push('status = ?'); vals.push(status); }
  if (name !== undefined) { if (typeof name !== 'string' || !name.trim() || name.length > 100) return res.status(400).json({ error: 'invalid_name' }); sets.push('name = ?'); vals.push(name.trim()); }
  if (pin !== undefined) { if (!PIN_RE.test(String(pin))) return res.status(400).json({ error: 'invalid_pin' }); sets.push('pin_hash = ?', 'pin_length = ?'); vals.push(hashPin(String(pin)), String(pin).length); }
  if (sets.length === 0) return res.status(400).json({ error: 'nothing_to_update' });
  const [r] = await pool.query(`UPDATE \`groups\` SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'group_not_found' });
  res.json({ ok: true });
}));

admin.delete('/groups/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM `groups` WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));
