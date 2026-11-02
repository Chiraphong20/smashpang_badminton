import React, { useEffect, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { userApi, getGroupId } from '../lib/api';

interface Helper { id: string; username: string | null; email: string | null; displayName: string }

const ERR: Record<string, string> = {
  user_not_found: 'ไม่พบบัญชีนี้ — ให้ผู้ช่วยสมัครสมาชิกก่อน แล้วกรอก Username หรืออีเมลของเขา',
  is_owner: 'บัญชีนี้เป็นเจ้าของก๊วนอยู่แล้ว',
  too_many_helpers: 'เพิ่มผู้ช่วยได้สูงสุด 10 คน',
  forbidden: 'ไม่มีสิทธิ์จัดการผู้ช่วย',
};

// เจ้าของก๊วนเชิญผู้ช่วยด้วย Username/อีเมล — ผู้ช่วยเข้าก๊วนด้วยบัญชีตัวเอง
export function HelpersManager() {
  const gid = getGroupId();
  const [list, setList] = useState<Helper[]>([]);
  const [ident, setIdent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const r = await userApi<Helper[]>(`/me/groups/${encodeURIComponent(gid)}/helpers`);
    if (r.ok) setList(r.data);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ident.trim()) return;
    setBusy(true); setError('');
    const r = await userApi<{ error?: string }>(`/me/groups/${encodeURIComponent(gid)}/helpers`, 'POST', { identifier: ident.trim() });
    setBusy(false);
    if (!r.ok) { setError(ERR[r.data.error || ''] || 'เพิ่มผู้ช่วยไม่สำเร็จ'); return; }
    setIdent(''); load();
  };

  const remove = async (h: Helper) => {
    if (!confirm(`เอา ${h.username || h.email} ออกจากผู้ช่วยใช่ไหม?`)) return;
    await userApi(`/me/groups/${encodeURIComponent(gid)}/helpers/${encodeURIComponent(h.id)}`, 'DELETE');
    load();
  };

  return (
    <section className="bg-white rounded-[2rem] p-4 sm:p-6 shadow-sm border border-on-surface/5 space-y-4">
      <div>
        <h3 className="font-headline font-black text-lg flex items-center gap-2">🤝 ผู้ช่วยจัดก๊วน</h3>
        <p className="text-xs font-semibold text-on-surface/50">ผู้ช่วยเข้าก๊วนนี้ด้วยบัญชีของตัวเอง จัดคอร์ท จัดผู้เล่น และเก็บเงินได้ แต่แก้ชื่อก๊วน พร้อมเพย์ ประกาศ และล้างข้อมูลไม่ได้</p>
      </div>
      <form onSubmit={add} className="flex gap-2">
        <input value={ident} onChange={e => setIdent(e.target.value)} placeholder="Username หรืออีเมลของผู้ช่วย" autoCapitalize="none" autoCorrect="off"
          className="flex-1 min-w-0 px-4 py-3 bg-background rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-primary/25" />
        <button disabled={busy || !ident.trim()} className="px-4 py-3 rounded-xl bg-primary text-white font-black text-sm flex items-center gap-2 disabled:opacity-40 whitespace-nowrap">
          <UserPlus size={16} /> เพิ่ม
        </button>
      </form>
      {error && <p className="text-xs font-bold text-red-500">{error}</p>}
      <div className="space-y-2">
        {list.length === 0 && <p className="text-xs font-semibold text-on-surface/40">ยังไม่มีผู้ช่วย</p>}
        {list.map(h => (
          <div key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5 bg-background rounded-xl">
            <div className="min-w-0">
              <p className="font-black text-sm truncate">{h.username || h.displayName}</p>
              <p className="text-xs font-semibold text-on-surface/45 truncate">{h.email}</p>
            </div>
            <button onClick={() => remove(h)} aria-label="เอาออก" className="p-2 rounded-lg text-on-surface/40 hover:text-red-500 hover:bg-red-50"><X size={16} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
