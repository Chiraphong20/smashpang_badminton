import React, { useEffect, useState } from 'react';
import { AuthPage } from './AuthPage';
import { AuthShell, authField, authPrimary, authGhost } from './AuthShell';
import {
  Me, MyGroup, groupUrl, getUserToken, setUserToken, clearUserToken,
  userApi, enterGroupAsOwner,
} from '../lib/api';

interface Props {
  notFoundId?: string;
}

const ERRORS: Record<string, string> = {
  invalid_id: 'รหัสก๊วนใช้ได้เฉพาะ a-z, 0-9 และ - ยาว 3–30 ตัว (ขึ้นต้นด้วยตัวอักษรหรือตัวเลข)',
  invalid_pin: 'PIN ต้องเป็นตัวเลข 4–8 หลัก',
  invalid_email: 'อีเมลไม่ถูกต้อง (เช่น name@example.com)',
  invalid_username: 'Username ใช้ได้เฉพาะ a-z, 0-9 และ . _ - ยาว 3–20 ตัว',
  username_taken: 'Username นี้ถูกใช้แล้ว',
  weak_password: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',
  id_taken: 'รหัสก๊วนนี้ถูกใช้แล้ว ลองรหัสอื่น',
  email_taken: 'อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบ',
  wrong_credentials: 'Username/อีเมล หรือรหัสผ่านไม่ถูกต้อง',
  not_verified: 'ยังไม่ได้ยืนยัน Gmail — เช็กอีเมลของคุณ หรือกดส่งลิงก์ใหม่',
  suspended: 'บัญชีนี้ถูกระงับ ติดต่อแอดมิน',
  too_many_attempts: 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่',
  invalid_or_expired: 'ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ — สมัครใหม่หรือกดส่งลิงก์ใหม่',
  network: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้',
};
const err = (code?: string) => ERRORS[code || ''] || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';

export function GroupGate({ notFoundId }: Props) {
  const [me, setMe] = useState<Me | null>(null);
  const [myGroups, setMyGroups] = useState<MyGroup[]>([]);
  const [notice, setNotice] = useState(notFoundId ? `ไม่พบก๊วนรหัส "${notFoundId}"` : '');
  const [checking, setChecking] = useState(() => !!getUserToken());

  const loadAccount = async () => {
    try { await loadAccountInner(); } finally { setChecking(false); }
  };
  const loadAccountInner = async () => {
    if (!getUserToken()) { setMe(null); return; }
    const r = await userApi<Me>('/me');
    if (!r.ok) { setMe(null); if (r.status === 401 || r.status === 403) clearUserToken(); return; }
    setMe(r.data);
    const g = await userApi<MyGroup[]>('/me/groups');
    if (g.ok) setMyGroups(g.data);
  };

  useEffect(() => {
    const verify = new URLSearchParams(window.location.search).get('verify');
    (async () => {
      if (verify) {
        // ลิงก์ยืนยันอีเมลเก่า (ก่อนยกเลิกขั้นตอนยืนยัน) ยังใช้ได้
        const r = await userApi<{ token: string; error?: string }>('/auth/verify', 'POST', { token: verify });
        history.replaceState(null, '', window.location.pathname);
        if (r.ok) { setUserToken(r.data.token); setNotice('ยืนยันบัญชีสำเร็จ ยินดีต้อนรับ! 🎉'); }
        else setNotice(err(r.data.error));
      }
      loadAccount();
    })();
  }, []);

  // ยังไม่ได้ล็อกอิน → หน้าเข้าสู่ระบบ/สมัครสมาชิก
  if (!me && checking) return <div className="fixed inset-0 bg-white" />;
  if (!me) {
    return <AuthPage notice={notice} onBack={() => { location.href = window.location.pathname; }} onDone={() => { setNotice(''); loadAccount(); }} />;
  }

  return (
    <AuthShell
      topLeft={<a href={window.location.pathname} className="text-sm font-bold text-gray-500 hover:text-gray-900">← หน้าแรก</a>}
      topRight={<a href="?find" className="font-black text-primary hover:underline">หาก๊วนตีแบด</a>}
    >
      <OwnerArea me={me} myGroups={myGroups} notice={notice}
        onReload={loadAccount} onLogout={() => { clearUserToken(); setMe(null); setMyGroups([]); }} />
    </AuthShell>
  );
}

// ───────────────────────── พื้นที่เจ้าของก๊วน ─────────────────────────
function OwnerArea({ me, myGroups, notice, onReload, onLogout }: {
  me: Me; myGroups: MyGroup[]; notice: string; onReload: () => void; onLogout: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const enter = async (gid: string) => {
    if (await enterGroupAsOwner(gid)) location.href = groupUrl(gid);
    else setError('เข้าก๊วนไม่สำเร็จ (ก๊วนอาจถูกระงับ)');
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const gid = id.trim().toLowerCase();
    const r = await userApi<{ error?: string; message?: string }>('/me/groups', 'POST', { id: gid });
    setBusy(false);
    if (!r.ok) { setError((r.data.error === 'plan_limit' && r.data.message) || err(r.data.error)); return; }
    await enter(gid);
  };

  return (
    <div className="space-y-6">
      {notice && <p className="px-4 py-3 bg-amber-50 text-amber-700 rounded-xl text-sm font-bold">{notice}</p>}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="font-headline font-black text-3xl text-gray-900 truncate">สวัสดี {me.username || me.displayName}</h2>
          <p className="text-sm text-gray-500 truncate">{me.email}{me.role === 'admin' ? ' · แอดมินระบบ' : ''}</p>
        </div>
        <button onClick={onLogout} className="text-xs font-bold text-gray-400 hover:text-gray-700 shrink-0 ml-3">ออกจากระบบ</button>
      </div>

      {me.role === 'admin' && (
        <a href="?admin" className={`${authGhost} block text-center`}>⚙️ จัดการระบบ (แอดมิน)</a>
      )}

      {!creating ? (
        <>
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-400">ก๊วนของฉัน</p>
            {myGroups.length === 0 && <p className="text-sm text-gray-400">ยังไม่มีก๊วน — สร้างก๊วนแรกของคุณได้เลย</p>}
            {myGroups.map(g => (
              <button key={g.id} onClick={() => enter(g.id)} disabled={g.status === 'suspended'}
                className="w-full flex items-center justify-between px-5 py-3 border-2 border-gray-100 hover:border-primary/40 hover:bg-primary/5 rounded-xl transition-all text-left disabled:opacity-40">
                <span className="min-w-0">
                  <span className="block font-bold text-gray-900 truncate">{g.name}</span>
                  <span className="block text-xs text-gray-400">{g.id}{g.name === g.id ? ' · ยังไม่ได้ตั้งชื่อ' : ''}{g.status === 'suspended' ? ' · ถูกระงับ' : ''}</span>
                </span>
                <span className="text-gray-300 ml-3">›</span>
              </button>
            ))}
          </div>
          {error && <p className="text-sm font-bold text-red-500">{error}</p>}
          <button onClick={() => { setCreating(true); setError(''); }} className={authPrimary}>+ สร้างก๊วนใหม่</button>
        </>
      ) : (
        <form onSubmit={create} className="space-y-5">
          <div className="space-y-1">
            <input autoFocus className={authField} placeholder="รหัสก๊วน (a-z, 0-9, -) เช่น tue-club" value={id} onChange={e => setId(e.target.value)} autoCapitalize="none" autoCorrect="off" maxLength={30} />
            <p className="text-xs text-gray-400 ml-1">ใช้เป็นลิงก์ก๊วน เช่น ?g=รหัสก๊วน (เข้าก๊วนด้วยบัญชีของคุณ)</p>
          </div>
          <p className="text-xs text-gray-400">ตั้งชื่อก๊วนและเลือกรูปแบบก๊วน (4 โหมด) ข้างในระบบ ตอนเข้าครั้งแรก</p>
          {error && <p className="text-sm font-bold text-red-500">{error}</p>}
          <div className="flex gap-3">
            <button type="button" className={authGhost} onClick={() => { setCreating(false); onReload(); }}>ยกเลิก</button>
            <button disabled={busy || !id.trim()} className={authPrimary}>{busy ? 'กำลังสร้าง...' : 'สร้างก๊วน'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
