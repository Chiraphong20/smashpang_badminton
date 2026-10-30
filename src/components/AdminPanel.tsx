import React, { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { userApi, getUserToken, setUserToken, clearUserToken, enterGroupAsOwner, groupUrl } from '../lib/api';

interface AUser { id: string; email: string | null; username: string | null; displayName: string; role: string; status: string; groupCount: number; createdAt: number; planId: string | null; planExpiresAt: number | null; sessionsThisMonth: number }
interface APlan { id: string; name: string; price: string; isDefault: boolean; maxPlayers: number | null; maxSessionsMonth: number | null; maxGroups: number | null; modes: string[]; features: { listing: boolean; queueScreen: boolean }; userCount: number }
const MODE_OPTS: [string, string][] = [['perGame', 'นับเกม'], ['buffet', 'บุฟเฟต์'], ['split', 'หารเท่า'], ['fun', 'สุ่มเพื่อน']];
const FEATURE_OPTS: [keyof APlan['features'], string][] = [['listing', 'ประกาศหาสมาชิก (หน้าหาก๊วน)'], ['queueScreen', 'หน้าคิวสาธารณะ / QR']];
const limitText = (n: number | null) => (n == null ? 'ไม่จำกัด' : String(n));
interface AGroup { id: string; name: string; status: string; createdAt: number; ownerName: string | null; ownerEmail: string | null }
interface Overview { users: number; pendingUsers: number; suspendedUsers: number; groups: number; suspendedGroups: number }

const STATUS_LABEL: Record<string, string> = { active: 'ใช้งาน', pending: 'รอยืนยัน', suspended: 'ระงับ' };
const STATUS_COLOR: Record<string, string> = { active: 'bg-emerald-100 text-emerald-700', pending: 'bg-amber-100 text-amber-700', suspended: 'bg-red-100 text-red-600' };

export function AdminPanel() {
  const [tab, setTab] = useState<'groups' | 'users' | 'plans'>('groups');
  const [plans, setPlans] = useState<APlan[]>([]);
  const [editing, setEditing] = useState<APlan | 'new' | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AUser[]>([]);
  const [groups, setGroups] = useState<AGroup[]>([]);
  const [denied, setDenied] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [o, u, g, p] = await Promise.all([
      userApi<Overview>('/admin/overview'), userApi<AUser[]>('/admin/users'), userApi<AGroup[]>('/admin/groups'), userApi<APlan[]>('/admin/plans'),
    ]);
    if (p.ok) setPlans(p.data);
    if (!o.ok) { setDenied(true); return; }
    setOverview(o.data);
    if (u.ok) setUsers(u.data);
    if (g.ok) setGroups(g.data);
  }, []);

  useEffect(() => { if (getUserToken()) load(); else setDenied(true); }, [load]);

  const act = async (path: string, method: string, body?: unknown, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    const r = await userApi(path, method, body);
    setMsg(r.ok ? 'บันทึกแล้ว' : 'ไม่สำเร็จ: ' + ((r.data as any)?.error || r.status));
    setTimeout(() => setMsg(''), 2500);
    load();
  };

  if (denied) {
    return <AdminLogin hadToken={!!getUserToken()} onLoggedIn={() => { setDenied(false); load(); }} />;
  }

  const btn = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-background hover:bg-on-surface/10';
  const badge = (s: string) => <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLOR[s] || ''}`}>{STATUS_LABEL[s] || s}</span>;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-headline font-black text-2xl">จัดการระบบ SmashPang</h1>
            <p className="text-xs text-on-surface/40 font-bold">แอดมินระบบ</p>
          </div>
          <div className="flex items-center gap-3">
            {msg && <span className="text-xs font-bold text-primary">{msg}</span>}
            <a href={window.location.pathname} className={btn}>← กลับ</a>
          </div>
        </div>

        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              ['เจ้าของก๊วนทั้งหมด', overview.users], ['รอยืนยัน', overview.pendingUsers],
              ['ก๊วนทั้งหมด', overview.groups], ['ก๊วน/บัญชีที่ระงับ', overview.suspendedGroups + overview.suspendedUsers],
            ] as [string, number][]).map(([l, v]) => (
              <div key={l} className="bg-white rounded-3xl p-5 shadow-sm border border-on-surface/5">
                <p className="text-xs font-bold text-on-surface/40">{l}</p>
                <p className="font-headline font-black text-3xl">{v}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          {(['groups', 'users', 'plans'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl font-bold text-sm ${tab === t ? 'bg-primary text-white' : 'bg-white text-on-surface/60'}`}>
              {t === 'groups' ? 'ก๊วน' : t === 'users' ? 'ผู้ใช้' : 'แพ็กเกจ'}
            </button>
          ))}
        </div>

        {tab === 'plans' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-on-surface/50 font-semibold">กำหนดขีดจำกัดของแต่ละแพ็กเกจ แล้วไปเลือกแพ็กเกจให้ผู้ใช้ที่แท็บ "ผู้ใช้"</p>
              <button className="px-4 py-2 rounded-xl bg-primary text-white font-bold text-sm shrink-0" onClick={() => setEditing('new')}>+ เพิ่มแพ็กเกจ</button>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {plans.map(pl => (
                <div key={pl.id} className="bg-white rounded-3xl p-5 shadow-sm border border-on-surface/5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-headline font-black text-xl">{pl.name}</p>
                      <p className="text-xs font-bold text-on-surface/45">{pl.price || '—'} · ใช้อยู่ {pl.userCount} คน</p>
                    </div>
                    {pl.isDefault && <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-700">ค่าเริ่มต้น</span>}
                  </div>
                  <ul className="text-sm space-y-1 font-semibold text-on-surface/70">
                    <li>ผู้เล่น/ครั้ง: <b>{limitText(pl.maxPlayers)}</b></li>
                    <li>จัดก๊วน/เดือน: <b>{limitText(pl.maxSessionsMonth)}</b></li>
                    <li>จำนวนก๊วน: <b>{limitText(pl.maxGroups)}</b></li>
                    <li>โหมด: <b>{pl.modes.map(m => MODE_OPTS.find(o => o[0] === m)?.[1]).join(', ')}</b></li>
                    <li>ฟีเจอร์: <b>{FEATURE_OPTS.filter(([k]) => pl.features[k]).map(o => o[1].split(' ')[0]).join(', ') || '—'}</b></li>
                  </ul>
                  <div className="flex gap-1.5">
                    <button className={btn} onClick={() => setEditing(pl)}>แก้ไข</button>
                    {!pl.isDefault && <button className={btn} onClick={() => act('/admin/plans', 'POST', { ...pl, isDefault: true })}>ตั้งเป็นค่าเริ่มต้น</button>}
                    {!pl.isDefault && <button className={`${btn} text-red-600`} onClick={() => act(`/admin/plans/${pl.id}`, 'DELETE', undefined, `ลบแพ็กเกจ "${pl.name}"? ผู้ใช้ที่ใช้อยู่จะกลับไปใช้แพ็กเกจค่าเริ่มต้น`)}>ลบ</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
        <div className="bg-white rounded-3xl shadow-sm border border-on-surface/5 overflow-x-auto">
          {tab === 'groups' ? (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-on-surface/40 border-b border-on-surface/5">
                <th className="p-3">ก๊วน</th><th className="p-3">เจ้าของ</th><th className="p-3">สถานะ</th><th className="p-3">สร้างเมื่อ</th><th className="p-3">จัดการ</th>
              </tr></thead>
              <tbody>
                {groups.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-on-surface/30">ยังไม่มีก๊วน</td></tr>}
                {groups.map(g => (
                  <tr key={g.id} className="border-b border-on-surface/5 last:border-0 align-top">
                    <td className="p-3"><p className="font-bold">{g.name}</p><p className="text-xs text-on-surface/40">{g.id}</p></td>
                    <td className="p-3"><p>{g.ownerName || '— ไม่มีเจ้าของ —'}</p><p className="text-xs text-on-surface/40">{g.ownerEmail}</p></td>
                    <td className="p-3">{badge(g.status)}</td>
                    <td className="p-3 text-xs">{format(g.createdAt, 'dd/MM/yyyy')}</td>
                    <td className="p-3"><div className="flex flex-wrap gap-1.5">
                      <button className={btn} onClick={async () => { if (await enterGroupAsOwner(g.id)) location.href = groupUrl(g.id); }}>เข้าก๊วน</button>
                      <button className={btn} onClick={() => { const n = prompt('ชื่อก๊วนใหม่', g.name); if (n && n.trim()) act(`/admin/groups/${g.id}`, 'PATCH', { name: n.trim() }); }}>เปลี่ยนชื่อ</button>
                      <button className={btn} onClick={() => act(`/admin/groups/${g.id}`, 'PATCH', { status: g.status === 'active' ? 'suspended' : 'active' })}>{g.status === 'active' ? 'ระงับ' : 'ปลดระงับ'}</button>
                      <button className={`${btn} text-red-600`} onClick={() => act(`/admin/groups/${g.id}`, 'DELETE', undefined, `ลบก๊วน "${g.name}" และข้อมูลทั้งหมดถาวร? ย้อนกลับไม่ได้`)}>ลบ</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-on-surface/40 border-b border-on-surface/5">
                <th className="p-3">ชื่อ</th><th className="p-3">ช่องทาง</th><th className="p-3">บทบาท</th><th className="p-3">สถานะ</th><th className="p-3">ก๊วน</th><th className="p-3 min-w-[16rem]">แพ็กเกจ / หมดอายุ</th><th className="p-3">สมัครเมื่อ</th><th className="p-3">จัดการ</th>
              </tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-on-surface/5 last:border-0">
                    <td className="p-3 font-bold">{u.username || u.displayName}</td>
                    <td className="p-3 text-xs">{u.email || ''}</td>
                    <td className="p-3 text-xs">{u.role === 'admin' ? 'แอดมิน' : 'เจ้าของก๊วน'}</td>
                    <td className="p-3">{badge(u.status)}</td>
                    <td className="p-3">{u.groupCount}</td>
                    <td className="p-3">
                      {u.role === 'admin' ? <span className="text-xs font-bold text-on-surface/40">แอดมิน — ไม่จำกัด</span> : (
                        <div className="space-y-1.5">
                          <div className="flex gap-1.5">
                            <select className="px-2 py-1.5 rounded-lg bg-background text-xs font-bold" value={u.planId || ''}
                              onChange={e => act(`/admin/users/${u.id}/plan`, 'PATCH', { planId: e.target.value || null, expiresAt: u.planExpiresAt })}>
                              <option value="">(ค่าเริ่มต้น{plans.find(p => p.isDefault) ? ': ' + plans.find(p => p.isDefault)!.name : ''})</option>
                              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <input type="date" className="px-2 py-1.5 rounded-lg bg-background text-xs font-bold" title="วันหมดอายุ (ว่าง = ไม่หมดอายุ)"
                              value={u.planExpiresAt ? format(u.planExpiresAt, 'yyyy-MM-dd') : ''}
                              onChange={e => act(`/admin/users/${u.id}/plan`, 'PATCH', { planId: u.planId, expiresAt: e.target.value ? new Date(e.target.value + 'T23:59:59').getTime() : null })} />
                          </div>
                          <p className="text-[11px] font-semibold text-on-surface/45">เดือนนี้จัดไปแล้ว {u.sessionsThisMonth} ครั้ง{u.planExpiresAt && u.planExpiresAt < Date.now() ? ' · หมดอายุแล้ว' : ''}</p>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-xs">{format(u.createdAt, 'dd/MM/yyyy')}</td>
                    <td className="p-3"><div className="flex flex-wrap gap-1.5">
                      {u.status === 'pending' && <button className={btn} onClick={() => act(`/admin/users/${u.id}`, 'PATCH', { status: 'active' }, `ยืนยันบัญชี ${u.displayName} ด้วยมือ?`)}>ยืนยันให้</button>}
                      {u.status === 'active' && <button className={btn} onClick={() => act(`/admin/users/${u.id}`, 'PATCH', { status: 'suspended' })}>ระงับ</button>}
                      {u.status === 'suspended' && <button className={btn} onClick={() => act(`/admin/users/${u.id}`, 'PATCH', { status: 'active' })}>ปลดระงับ</button>}
                      <button className={`${btn} text-red-600`} onClick={() => act(`/admin/users/${u.id}`, 'DELETE', undefined, `ลบบัญชี ${u.displayName}? (ก๊วนของเขาจะไม่ถูกลบ)`)}>ลบ</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        )}
      </div>

      {editing && <PlanEditor plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={async (body) => { await act('/admin/plans', 'POST', body); setEditing(null); }} />}
    </div>
  );
}

function PlanEditor({ plan, onClose, onSave }: { plan: APlan | null; onClose: () => void; onSave: (body: unknown) => void }) {
  const [name, setName] = useState(plan?.name ?? '');
  const [price, setPrice] = useState(plan?.price ?? '');
  const [maxPlayers, setMaxPlayers] = useState(plan?.maxPlayers == null ? '' : String(plan.maxPlayers));
  const [maxSessions, setMaxSessions] = useState(plan?.maxSessionsMonth == null ? '' : String(plan.maxSessionsMonth));
  const [maxGroups, setMaxGroups] = useState(plan?.maxGroups == null ? '' : String(plan.maxGroups));
  const [modes, setModes] = useState<string[]>(plan?.modes ?? MODE_OPTS.map(o => o[0]));
  const [features, setFeatures] = useState(plan?.features ?? { listing: true, queueScreen: true });
  const field = 'w-full px-3 py-2.5 bg-background rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';
  const toggleMode = (m: string) => setModes(v => (v.includes(m) ? v.filter(x => x !== m) : [...v, m]));
  const save = () => {
    if (!name.trim()) return alert('ใส่ชื่อแพ็กเกจ');
    if (modes.length === 0) return alert('เลือกอย่างน้อย 1 โหมด');
    onSave({ id: plan?.id, name: name.trim(), price, maxPlayers, maxSessionsMonth: maxSessions, maxGroups, modes, features, isDefault: plan?.isDefault });
  };
  return (
    <div className="fixed inset-0 z-[400] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-headline font-black text-xl">{plan ? 'แก้ไขแพ็กเกจ' : 'เพิ่มแพ็กเกจ'}</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 space-y-1"><span className="text-xs font-bold text-on-surface/50">ชื่อแพ็กเกจ</span><input className={field} value={name} onChange={e => setName(e.target.value)} maxLength={60} /></label>
          <label className="col-span-2 space-y-1"><span className="text-xs font-bold text-on-surface/50">ราคา (ข้อความ เช่น 199 บาท/เดือน)</span><input className={field} value={price} onChange={e => setPrice(e.target.value)} maxLength={60} /></label>
          <label className="space-y-1"><span className="text-xs font-bold text-on-surface/50">ผู้เล่น/ครั้ง (ว่าง = ไม่จำกัด)</span><input className={field} inputMode="numeric" value={maxPlayers} onChange={e => setMaxPlayers(e.target.value.replace(/\D/g, ''))} /></label>
          <label className="space-y-1"><span className="text-xs font-bold text-on-surface/50">จัดก๊วน/เดือน (ว่าง = ไม่จำกัด)</span><input className={field} inputMode="numeric" value={maxSessions} onChange={e => setMaxSessions(e.target.value.replace(/\D/g, ''))} /></label>
          <label className="space-y-1"><span className="text-xs font-bold text-on-surface/50">จำนวนก๊วน (ว่าง = ไม่จำกัด)</span><input className={field} inputMode="numeric" value={maxGroups} onChange={e => setMaxGroups(e.target.value.replace(/\D/g, ''))} /></label>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-bold text-on-surface/50">โหมดที่ใช้ได้</p>
          <div className="flex flex-wrap gap-2">
            {MODE_OPTS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => toggleMode(k)} className={`px-3 py-2 rounded-xl text-sm font-bold border-2 ${modes.includes(k) ? 'bg-primary text-white border-primary' : 'border-on-surface/10 text-on-surface/50'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-bold text-on-surface/50">ฟีเจอร์ที่เปิดให้</p>
          {FEATURE_OPTS.map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-4 h-4 accent-primary" checked={features[k]} onChange={e => setFeatures(f => ({ ...f, [k]: e.target.checked }))} /> {l}</label>
          ))}
        </div>
        <div className="flex gap-3 pt-1">
          <button className="flex-1 py-3 rounded-xl bg-background font-black text-sm text-on-surface/60" onClick={onClose}>ยกเลิก</button>
          <button className="flex-[2] py-3 rounded-xl bg-primary text-white font-black text-sm" onClick={save}>บันทึก</button>
        </div>
      </div>
    </div>
  );
}


// ฟอร์มล็อกอินของหน้าแอดมิน — ใช้บัญชีที่เป็นแอดมินระบบเท่านั้น
function AdminLogin({ hadToken, onLoggedIn }: { hadToken: boolean; onLoggedIn: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(hadToken ? 'บัญชีที่ล็อกอินอยู่ไม่ใช่แอดมินระบบ — เข้าสู่ระบบด้วยบัญชีแอดมิน' : '');
  const field = 'w-full px-4 py-3 bg-white rounded-xl font-bold border border-on-surface/10 focus:outline-none focus:ring-2 focus:ring-primary/30';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await userApi<{ token: string; error?: string }>('/auth/login', 'POST', { identifier: identifier.trim(), password });
    if (!r.ok) { setBusy(false); setError('Username/อีเมล หรือรหัสผ่านไม่ถูกต้อง'); return; }
    setUserToken(r.data.token);
    const check = await userApi('/admin/overview');
    setBusy(false);
    if (!check.ok) { clearUserToken(); setError('บัญชีนี้ไม่ใช่แอดมินระบบ'); return; }
    onLoggedIn();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-sm border border-on-surface/5 space-y-4">
        <div>
          <h1 className="font-headline font-black text-2xl">แอดมินระบบ</h1>
          <p className="text-xs font-bold text-on-surface/45">เข้าสู่ระบบด้วยบัญชีแอดมิน</p>
        </div>
        <input autoFocus className={field} placeholder="Username หรืออีเมล" value={identifier} onChange={e => setIdentifier(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" />
        <input className={field} type="password" placeholder="รหัสผ่าน" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <p className="text-sm font-bold text-red-500">{error}</p>}
        <button disabled={busy || !identifier.trim() || !password} className="w-full py-3.5 rounded-xl bg-primary text-white font-black disabled:opacity-50">{busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</button>
        <a href={window.location.pathname} className="block text-center text-xs font-bold text-on-surface/40 hover:text-on-surface/70">← กลับหน้าแรก</a>
      </form>
    </div>
  );
}
