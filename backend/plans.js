import { pool } from './db.js';

// ───────────────────────── แพ็กเกจ (Plans) ─────────────────────────
// แพ็กเกจผูกกับ "บัญชีเจ้าของก๊วน" (users.plan_id) — ขีดจำกัดใช้กับทุกก๊วนของคนนั้น
//  - users.plan_id = NULL        → ใช้แพ็กเกจเริ่มต้น (plans.is_default = 1)
//  - users.plan_expires_at       → หมดอายุแล้วตกไปใช้แพ็กเกจ 'free' (ถ้าไม่มี ใช้ค่าเริ่มต้น)
//  - ก๊วนที่ไม่มีเจ้าของ และบัญชีแอดมินระบบ → ไม่จำกัด
// ค่า NULL ในช่อง max_* = ไม่จำกัด

export const ALL_MODES = ['perGame', 'buffet', 'split', 'fun'];
export const FEATURE_KEYS = ['listing', 'queueScreen']; // ประกาศหาสมาชิก · หน้าคิวสาธารณะ

const BKK_OFFSET = 7 * 60 * 60 * 1000;
// เริ่มต้นเดือนตามเวลาไทย (ms)
export function monthStartMs(now = Date.now()) {
  const d = new Date(now + BKK_OFFSET);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - BKK_OFFSET;
}

const UNLIMITED = {
  id: 'unlimited', name: 'ไม่จำกัด', price: '', isDefault: false,
  maxPlayers: null, maxSessionsMonth: null, maxGroups: null,
  modes: ALL_MODES, features: { listing: true, queueScreen: true },
};

const parseJson = (t, fb) => { try { return JSON.parse(t) ?? fb; } catch { return fb; } };

export function planDto(row) {
  if (!row) return UNLIMITED;
  const modes = parseJson(row.modes, ALL_MODES).filter(m => ALL_MODES.includes(m));
  const feats = parseJson(row.features, {});
  return {
    id: row.id,
    name: row.name,
    price: row.price || '',
    isDefault: !!row.is_default,
    maxPlayers: row.max_players ?? null,
    maxSessionsMonth: row.max_sessions_month ?? null,
    maxGroups: row.max_groups ?? null,
    modes,
    features: Object.fromEntries(FEATURE_KEYS.map(k => [k, feats[k] !== false])),
  };
}

// สร้างตาราง + แพ็กเกจเริ่มต้น + นับโควตาเดิมย้อนหลัง (เรียกตอน boot)
export async function ensurePlans() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plans (
      id VARCHAR(30) PRIMARY KEY,
      name VARCHAR(60) NOT NULL,
      price VARCHAR(60) NULL,
      max_players INT NULL,
      max_sessions_month INT NULL,
      max_groups INT NULL,
      modes TEXT NOT NULL,
      features TEXT NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT false,
      sort_order INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS session_usage (
      group_id VARCHAR(40) NOT NULL,
      session_key VARCHAR(40) NOT NULL,
      owner_id VARCHAR(40) NULL,
      started_at BIGINT NOT NULL,
      PRIMARY KEY (group_id, session_key),
      INDEX idx_usage_owner (owner_id, started_at)
    )
  `);
  const addColumn = async (table, column, ddl) => {
    const [rows] = await pool.query(
      'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?', [table, column]);
    if (rows.length === 0) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  };
  await addColumn('users', 'plan_id', 'plan_id VARCHAR(30) NULL');
  await addColumn('users', 'plan_expires_at', 'plan_expires_at BIGINT NULL');

  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM plans');
  if (n === 0) {
    const now = Date.now();
    await pool.query(
      'INSERT INTO plans (id, name, price, max_players, max_sessions_month, max_groups, modes, features, is_default, sort_order, created_at) VALUES ?',
      [[
        ['unlimited', 'ไม่จำกัด', '', null, null, null, JSON.stringify(ALL_MODES), JSON.stringify({ listing: true, queueScreen: true }), true, 0, now],
        ['free', 'ฟรี', '0 บาท', 16, 4, 1, JSON.stringify(['perGame', 'fun']), JSON.stringify({ listing: true, queueScreen: true }), false, 1, now],
      ]]
    );
  }

  // นับเซสชันที่เคยจัดไว้แล้ว (จาก sessionHistory ของแต่ละก๊วน) เข้าโควตารายเดือน — ทำซ้ำได้ ไม่ซ้อน
  const [groups] = await pool.query('SELECT id, owner_id FROM `groups`');
  for (const g of groups) {
    const [rows] = await pool.query("SELECT state_value FROM system_states WHERE group_id = ? AND state_key = 'sessionHistory'", [g.id]);
    const hist = parseJson(rows[0]?.state_value, []);
    for (const s of Array.isArray(hist) ? hist : []) {
      const d = Number(s?.date);
      if (!Number.isFinite(d) || d <= 0) continue;
      await pool.query('INSERT IGNORE INTO session_usage (group_id, session_key, owner_id, started_at) VALUES (?, ?, ?, ?)', [g.id, String(d), g.owner_id, d]);
    }
  }
}

async function defaultPlanRow() {
  const [rows] = await pool.query('SELECT * FROM plans WHERE is_default = 1 ORDER BY sort_order LIMIT 1');
  return rows[0] || null;
}

// แพ็กเกจที่ใช้งานจริงของเจ้าของก๊วนคนหนึ่ง
export async function effectivePlan(ownerId) {
  if (!ownerId) return { plan: UNLIMITED, expiresAt: null, expired: false, owner: null };
  const [[u]] = await pool.query('SELECT id, role, plan_id, plan_expires_at FROM users WHERE id = ?', [ownerId]);
  if (!u || u.role === 'admin') return { plan: UNLIMITED, expiresAt: null, expired: false, owner: u || null };
  const expiresAt = u.plan_expires_at == null ? null : Number(u.plan_expires_at);
  const expired = expiresAt !== null && expiresAt < Date.now();
  let row = null;
  if (!expired && u.plan_id) [[row]] = await pool.query('SELECT * FROM plans WHERE id = ?', [u.plan_id]);
  if (!row && expired) [[row]] = await pool.query("SELECT * FROM plans WHERE id = 'free'");
  if (!row) row = await defaultPlanRow();
  return { plan: planDto(row), expiresAt, expired, owner: u };
}

export async function usageFor(ownerId) {
  if (!ownerId) return { sessionsThisMonth: 0, groups: 0 };
  const [[s]] = await pool.query('SELECT COUNT(*) AS n FROM session_usage WHERE owner_id = ? AND started_at >= ?', [ownerId, monthStartMs()]);
  const [[g]] = await pool.query('SELECT COUNT(*) AS n FROM `groups` WHERE owner_id = ?', [ownerId]);
  return { sessionsThisMonth: Number(s.n), groups: Number(g.n) };
}

// ผู้เล่น "วันนี้" = คนที่เช็กอินแล้ว หรือเคยตีแล้ว (ไม่นับรายชื่อสมาชิกที่แค่พักอยู่)
export const todayPlayerCount = (members) =>
  (Array.isArray(members) ? members : []).filter(m => m && (['waiting', 'playing', 'paid'].includes(m.status) || (m.gamesPlayed || 0) > 0)).length;

// ตรวจก่อนบันทึก state ของก๊วน — คืน null ถ้าผ่าน หรือ { code, message } ถ้าเกินขีดจำกัด
// เกณฑ์ "เพิ่มขึ้นจากที่บันทึกไว้เดิม" เท่านั้นที่ถูกปฏิเสธ — ลดสิทธิ์กลางวันแล้วจะไม่ทำให้บันทึกข้อมูลเดิม (เช่นการชำระเงิน) ไม่ได้
export async function gateState(gid, stateObj) {
  const [[g]] = await pool.query('SELECT owner_id FROM `groups` WHERE id = ?', [gid]);
  if (!g) return null;
  const { plan } = await effectivePlan(g.owner_id);

  const [prevRows] = await pool.query("SELECT state_key, state_value FROM system_states WHERE group_id = ? AND state_key IN ('members', 'sessionMode')", [gid]);
  const prev = Object.fromEntries(prevRows.map(r => [r.state_key, parseJson(r.state_value, null)]));

  const mode = stateObj.sessionMode;
  if (mode && mode !== prev.sessionMode && !plan.modes.includes(mode)) {
    return { code: 'mode_not_allowed', message: `แพ็กเกจ "${plan.name}" ไม่รองรับโหมดนี้` };
  }

  if (plan.maxPlayers != null && stateObj.members) {
    const now = todayPlayerCount(stateObj.members);
    if (now > plan.maxPlayers && now > todayPlayerCount(prev.members)) {
      return { code: 'players_limit', message: `แพ็กเกจ "${plan.name}" รองรับผู้เล่นสูงสุด ${plan.maxPlayers} คนต่อครั้ง` };
    }
  }

  const start = Number(stateObj.sessionStartDate);
  if (Number.isFinite(start) && start > 0) {
    const key = String(start);
    const [[seen]] = await pool.query('SELECT 1 AS x FROM session_usage WHERE group_id = ? AND session_key = ?', [gid, key]);
    if (!seen) {
      if (plan.maxSessionsMonth != null && start >= monthStartMs()) {
        const { sessionsThisMonth } = await usageFor(g.owner_id);
        if (sessionsThisMonth >= plan.maxSessionsMonth) {
          return { code: 'sessions_limit', message: `แพ็กเกจ "${plan.name}" จัดก๊วนได้ ${plan.maxSessionsMonth} ครั้งต่อเดือน (ครบแล้ว)` };
        }
      }
      await pool.query('INSERT IGNORE INTO session_usage (group_id, session_key, owner_id, started_at) VALUES (?, ?, ?, ?)', [gid, key, g.owner_id, start]);
    }
  }
  return null;
}

// ───────────────────────── เส้นทางของก๊วน: GET /api/g/:gid/plan ─────────────────────────
export function mountGroupPlan(r) {
  r.get('/plan', async (req, res) => {
    try {
      const [[g]] = await pool.query('SELECT owner_id FROM `groups` WHERE id = ?', [req.params.gid]);
      const ownerId = g?.owner_id ?? null;
      const { plan, expiresAt, expired } = await effectivePlan(ownerId);
      res.json({ plan, expiresAt, expired, usage: await usageFor(ownerId), monthStart: monthStartMs() });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server_error' });
    }
  });
}

// ───────────────────────── เส้นทางแอดมิน ─────────────────────────
const intOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : undefined; // undefined = ไม่ถูกต้อง
};

export function mountAdminPlans(admin, wrap) {
  admin.get('/plans', wrap(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT p.*, (SELECT COUNT(*) FROM users u WHERE u.plan_id = p.id) AS user_count FROM plans p ORDER BY p.sort_order, p.created_at');
    res.json(rows.map(r => ({ ...planDto(r), userCount: Number(r.user_count) })));
  }));

  // สร้าง/แก้แพ็กเกจ (ส่ง id = แก้ ไม่ส่ง = สร้างใหม่)
  admin.post('/plans', wrap(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name || name.length > 60) return res.status(400).json({ error: 'invalid_name' });
    const maxPlayers = intOrNull(b.maxPlayers), maxSessions = intOrNull(b.maxSessionsMonth), maxGroups = intOrNull(b.maxGroups);
    if ([maxPlayers, maxSessions, maxGroups].includes(undefined)) return res.status(400).json({ error: 'invalid_limit' });
    const modes = (Array.isArray(b.modes) ? b.modes : []).filter(m => ALL_MODES.includes(m));
    if (modes.length === 0) return res.status(400).json({ error: 'need_one_mode' });
    const features = Object.fromEntries(FEATURE_KEYS.map(k => [k, b.features?.[k] !== false]));
    const price = String(b.price || '').trim().slice(0, 60);

    let id = typeof b.id === 'string' ? b.id : '';
    if (!id) {
      id = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'plan') + '-' + Math.random().toString(36).slice(2, 6);
      await pool.query(
        'INSERT INTO plans (id, name, price, max_players, max_sessions_month, max_groups, modes, features, is_default, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, false, 50, ?)',
        [id, name, price, maxPlayers, maxSessions, maxGroups, JSON.stringify(modes), JSON.stringify(features), Date.now()]);
    } else {
      const [r] = await pool.query(
        'UPDATE plans SET name = ?, price = ?, max_players = ?, max_sessions_month = ?, max_groups = ?, modes = ?, features = ? WHERE id = ?',
        [name, price, maxPlayers, maxSessions, maxGroups, JSON.stringify(modes), JSON.stringify(features), id]);
      if (r.affectedRows === 0) return res.status(404).json({ error: 'plan_not_found' });
    }
    if (b.isDefault === true) {
      await pool.query('UPDATE plans SET is_default = (id = ?)', [id]);
    }
    res.json({ ok: true, id });
  }));

  admin.delete('/plans/:id', wrap(async (req, res) => {
    const [[p]] = await pool.query('SELECT is_default FROM plans WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'plan_not_found' });
    if (p.is_default) return res.status(400).json({ error: 'cannot_delete_default' });
    await pool.query('UPDATE users SET plan_id = NULL WHERE plan_id = ?', [req.params.id]); // กลับไปใช้แพ็กเกจเริ่มต้น
    await pool.query('DELETE FROM plans WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  }));

  // กำหนดแพ็กเกจ/วันหมดอายุให้ผู้ใช้ (planId = null → แพ็กเกจเริ่มต้น, expiresAt = null → ไม่หมดอายุ)
  admin.patch('/users/:id/plan', wrap(async (req, res) => {
    const { planId, expiresAt } = req.body || {};
    if (planId) {
      const [[p]] = await pool.query('SELECT id FROM plans WHERE id = ?', [planId]);
      if (!p) return res.status(404).json({ error: 'plan_not_found' });
    }
    const exp = expiresAt === null || expiresAt === undefined || expiresAt === '' ? null : Number(expiresAt);
    if (exp !== null && !Number.isFinite(exp)) return res.status(400).json({ error: 'invalid_date' });
    const [r] = await pool.query('UPDATE users SET plan_id = ?, plan_expires_at = ? WHERE id = ?', [planId || null, exp, req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'user_not_found' });
    res.json({ ok: true });
  }));
}
