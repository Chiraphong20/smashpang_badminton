import React, { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { userApi, getUserToken, enterGroupAsOwner, groupUrl } from '../lib/api';

interface AUser { id: string; email: string | null; username: string | null; displayName: string; role: string; status: string; groupCount: number; createdAt: number }
interface AGroup { id: string; name: string; status: string; createdAt: number; ownerName: string | null; ownerEmail: string | null }
interface Overview { users: number; pendingUsers: number; suspendedUsers: number; groups: number; suspendedGroups: number }

const STATUS_LABEL: Record<string, string> = { active: 'ใช้งาน', pending: 'รอยืนยัน', suspended: 'ระงับ' };
const STATUS_COLOR: Record<string, string> = { active: 'bg-emerald-100 text-emerald-700', pending: 'bg-amber-100 text-amber-700', suspended: 'bg-red-100 text-red-600' };

export function AdminPanel() {
  const [tab, setTab] = useState<'groups' | 'users'>('groups');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AUser[]>([]);
  const [groups, setGroups] = useState<AGroup[]>([]);
  const [denied, setDenied] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [o, u, g] = await Promise.all([
      userApi<Overview>('/admin/overview'), userApi<AUser[]>('/admin/users'), userApi<AGroup[]>('/admin/groups'),
    ]);
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-3">
          <p className="font-bold">ต้องเข้าสู่ระบบด้วยบัญชีแอดมินระบบ</p>
          <a href={window.location.pathname} className="inline-block px-5 py-3 bg-primary text-white rounded-xl font-bold text-sm">ไปหน้าเข้าสู่ระบบ</a>
        </div>
      </div>
    );
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
          {(['groups', 'users'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl font-bold text-sm ${tab === t ? 'bg-primary text-white' : 'bg-white text-on-surface/60'}`}>
              {t === 'groups' ? 'ก๊วน' : 'ผู้ใช้'}
            </button>
          ))}
        </div>

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
                      <button className={btn} onClick={() => { const p = prompt('PIN ใหม่ (ตัวเลข 4–8 หลัก)'); if (p) act(`/admin/groups/${g.id}`, 'PATCH', { pin: p }); }}>รีเซ็ต PIN</button>
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
                <th className="p-3">ชื่อ</th><th className="p-3">ช่องทาง</th><th className="p-3">บทบาท</th><th className="p-3">สถานะ</th><th className="p-3">ก๊วน</th><th className="p-3">สมัครเมื่อ</th><th className="p-3">จัดการ</th>
              </tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-on-surface/5 last:border-0">
                    <td className="p-3 font-bold">{u.username || u.displayName}</td>
                    <td className="p-3 text-xs">{u.email || ''}</td>
                    <td className="p-3 text-xs">{u.role === 'admin' ? 'แอดมิน' : 'เจ้าของก๊วน'}</td>
                    <td className="p-3">{badge(u.status)}</td>
                    <td className="p-3">{u.groupCount}</td>
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
      </div>
    </div>
  );
}
