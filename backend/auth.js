import crypto from 'crypto';

// TOKEN_SECRET ใช้เซ็น token — ถ้าไม่ตั้งไว้จะสุ่มใหม่ทุกครั้งที่ boot (ทุกคนต้อง login ใหม่หลัง restart)
let secret = process.env.TOKEN_SECRET;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  TOKEN_SECRET ไม่ได้ตั้งค่า — ใช้ค่าสุ่มชั่วคราว (ตั้งใน .env เพื่อให้ login ค้างข้าม restart)');
}

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPin(pin, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const attempt = crypto.scryptSync(String(pin), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return attempt.length === expected.length && crypto.timingSafeEqual(attempt, expected);
}

const sign = (payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

export function issueToken(groupId) {
  const payload = Buffer.from(JSON.stringify({ g: groupId, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

// token ต้องออกให้ก๊วนเดียวกับที่อยู่ใน URL เท่านั้น — กันก๊วน A เอา token ไปแก้ข้อมูลก๊วน B
export function requireGroupAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const data = readToken(header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!data || data.g !== req.params.gid) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// ── token ของบัญชีผู้ใช้ (เจ้าของก๊วน/แอดมิน) — คนละชนิดกับ token ก๊วน ──
// token ก๊วนมี claim `g`, token ผู้ใช้มี claim `u` → ใช้ข้ามกันไม่ได้
export function issueUserToken(userId) {
  const payload = Buffer.from(JSON.stringify({ u: userId, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function userIdFromRequest(req) {
  const header = req.headers.authorization || '';
  const data = readToken(header.startsWith('Bearer ') ? header.slice(7) : null);
  return data && typeof data.u === 'string' ? data.u : null;
}

// จำกัดจำนวนครั้งที่ลอง PIN ผิดต่อ (ip + ก๊วน) กัน brute force
const attempts = new Map();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

export function loginThrottle(req, res, next) {
  const key = `${req.ip}|${req.params.gid}`;
  const now = Date.now();
  const rec = attempts.get(key);
  if (rec && rec.resetAt > now && rec.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'too_many_attempts' });
  }
  req.throttleKey = key;
  next();
}

export function recordLoginResult(key, ok) {
  if (ok) { attempts.delete(key); return; }
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else rec.count++;
}
