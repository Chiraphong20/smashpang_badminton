import type { SessionMode } from '../types';
const API_BASE = import.meta.env.VITE_API_URL || '';

const params = () => new URLSearchParams(window.location.search);

// ก๊วนปัจจุบัน อ่านจาก ?g=<id> ใน URL (ว่าง = ยังไม่ได้เลือกก๊วน)
export const getGroupId = (): string => (params().get('g') || '').trim().toLowerCase();
export const isQueueMode = (): boolean => params().has('queue');

const tokenKey = (gid: string) => `sp_token_${gid}`;

export const getToken = (gid = getGroupId()): string | null => {
  try { return localStorage.getItem(tokenKey(gid)); } catch { return null; }
};
export const setToken = (gid: string, token: string) => {
  try { localStorage.setItem(tokenKey(gid), token); } catch { /* storage blocked */ }
};
export const clearToken = (gid = getGroupId()) => {
  try { localStorage.removeItem(tokenKey(gid)); } catch { /* storage blocked */ }
};

// ก๊วนที่เคยเข้า (เก็บไว้ในเครื่องเพื่อกดเข้าซ้ำได้เร็ว) — ไม่ใช่ข้อมูลลับ
const RECENT_KEY = 'sp_recent_groups';
export interface RecentGroup { id: string; name: string }
export const getRecentGroups = (): RecentGroup[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
};
export const rememberGroup = (g: RecentGroup) => {
  try {
    const list = [g, ...getRecentGroups().filter(x => x.id !== g.id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* storage blocked */ }
};

export const groupUrl = (gid: string, extra = '') => `${window.location.pathname}?g=${encodeURIComponent(gid)}${extra}`;

// เรียก API ของก๊วนปัจจุบัน: /api/g/<gid><path> พร้อมแนบ token
// ถ้าเซิร์ฟเวอร์ตอบ 401 (token หมดอายุ/ไม่ถูกต้อง) ให้ล้าง token แล้วโหลดหน้าใหม่ไปที่หน้า login
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const gid = getGroupId();
  const headers = new Headers(init.headers);
  const token = getToken(gid);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE}/api/g/${encodeURIComponent(gid)}${path}`, { ...init, headers });
  if (res.status === 401 && token) {
    clearToken(gid);
    location.reload();
  }
  return res;
}

export const apiJson = (path: string, body: unknown, method = 'POST') =>
  apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export async function fetchGroupInfo(gid: string): Promise<{ id: string; name: string; pinLength: number; suspended?: boolean; schedule?: ListingSlot[] } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/g/${encodeURIComponent(gid)}/info`);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// ───────────────────────── บัญชีผู้ใช้ (เจ้าของก๊วน / แอดมินระบบ) ─────────────────────────
export interface Me { id: string; email: string | null; username: string | null; displayName: string; role: 'owner' | 'admin'; status: string }
export interface MyGroup { id: string; name: string; status: string; createdAt: number }

const USER_TOKEN_KEY = 'sp_user_token';
export const getUserToken = (): string | null => { try { return localStorage.getItem(USER_TOKEN_KEY); } catch { return null; } };
export const setUserToken = (t: string) => { try { localStorage.setItem(USER_TOKEN_KEY, t); } catch { /* storage blocked */ } };
export const clearUserToken = () => { try { localStorage.removeItem(USER_TOKEN_KEY); } catch { /* storage blocked */ } };

export async function fetchConfig(): Promise<{ emailEnabled: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    return res.ok ? await res.json() : { emailEnabled: false };
  } catch { return { emailEnabled: false }; }
}

// เรียก API ที่ใช้ token ผู้ใช้ คืน { ok, status, data } เสมอ (ไม่ throw)
export async function userApi<T = any>(path: string, method = 'GET', body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const headers: Record<string, string> = {};
    const token = getUserToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token) clearUserToken();
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'network' } as T };
  }
}

// ───────────────────────── หาก๊วน (ประกาศรับสมาชิก) ─────────────────────────
export interface ListingSlot { day: number; start: string; end: string }
export interface Listing {
  name: string;
  description: string;
  venue: string;
  area: string;
  mapUrl: string;
  schedule: ListingSlot[];
  levels: string[];
  price: string;
  contact: string;
  updatedAt: number;
}

export const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

// "วันอังคาร 18:00–21:00 น." / "วันอังคาร 18:00 น. เป็นต้นไป"
export const formatSlot = (s: ListingSlot) =>
  `วัน${DAY_NAMES[s.day]} ${s.start}${s.end ? `–${s.end}` : ''} น.${s.end ? '' : ' เป็นต้นไป'}`;

export async function fetchListings(filter: { day?: number | null; level?: string; q?: string }): Promise<Listing[] | null> {
  try {
    const qs = new URLSearchParams();
    if (filter.day !== null && filter.day !== undefined) qs.set('day', String(filter.day));
    if (filter.level) qs.set('level', filter.level);
    if (filter.q?.trim()) qs.set('q', filter.q.trim());
    const res = await fetch(`${API_BASE}/api/listings?${qs}`);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// เจ้าของก๊วน/แอดมินเข้าก๊วนโดยไม่ต้องใส่ PIN
export async function enterGroupAsOwner(gid: string): Promise<boolean> {
  const r = await userApi<{ token: string }>(`/me/groups/${encodeURIComponent(gid)}/enter`, 'POST');
  if (!r.ok) return false;
  setToken(gid, r.data.token);
  return true;
}

// ───────────────────────── แพ็กเกจ (Plans) ─────────────────────────

export interface PlanLimits {
  id: string;
  name: string;
  price: string;
  isDefault: boolean;
  maxPlayers: number | null;        // ผู้เล่นต่อครั้ง · null = ไม่จำกัด
  maxSessionsMonth: number | null;  // จำนวนครั้งที่จัดก๊วนต่อเดือน
  maxGroups: number | null;
  modes: SessionMode[];
  features: { listing: boolean; queueScreen: boolean };
}
export interface PlanInfo {
  plan: PlanLimits;
  expiresAt: number | null;
  expired: boolean;
  usage: { sessionsThisMonth: number; groups: number };
}

export async function fetchPlan(): Promise<PlanInfo | null> {
  try {
    const res = await apiFetch('/plan');
    return res.ok ? await res.json() : null;
  } catch { return null; }
}
