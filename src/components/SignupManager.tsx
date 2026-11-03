import React, { useEffect, useState } from 'react';
import { Copy, Check, X } from 'lucide-react';
import { apiFetch, apiJson, getGroupId, groupUrl } from '../lib/api';
import { ShareLink } from './ShareLink';

interface Entry { id: string; name: string; contact: string; status: 'confirmed' | 'waitlist'; position: number }
interface Data { open: boolean; capacity: number; title: string; note: string; entries: Entry[] }

// เจ้าของ/ผู้ช่วยเปิด-ปิดการลงชื่อล่วงหน้า ตั้งจำนวนที่นั่ง และดึงรายชื่อที่ยืนยันแล้วเข้าก๊วนวันนี้
export function SignupManager({ maxPlayers, onImport }: { maxPlayers?: number | null; onImport: (names: string[]) => void }) {
  const gid = getGroupId();
  const link = `${window.location.origin}${groupUrl(gid, '&signup')}`;
  const [d, setD] = useState<Data | null>(null);
  const [cfg, setCfg] = useState({ open: false, capacity: 16, title: '', note: '' });
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async (keepCfg = false) => {
    const res = await apiFetch('/signup/admin');
    if (!res.ok) return;
    const j: Data = await res.json();
    setD(j);
    if (!keepCfg) setCfg({ open: j.open, capacity: j.capacity, title: j.title, note: j.note });
  };
  useEffect(() => { load(); const t = setInterval(() => load(true), 15000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (next = cfg) => {
    const res = await apiJson('/signup/config', next, 'PUT');
    if (res.ok) { const j = await res.json(); setCfg({ ...next, capacity: j.capacity }); setDirty(false); setMsg('บันทึกแล้ว'); setTimeout(() => setMsg(''), 1800); load(true); }
    else setMsg('บันทึกไม่สำเร็จ');
  };

  const remove = async (e: Entry) => {
    if (!confirm(`ลบ ${e.name} ออกจากรายชื่อ?`)) return;
    await apiFetch(`/signup/entry/${e.id}`, { method: 'DELETE' });
    load(true);
  };

  const confirmed = d?.entries.filter(e => e.status === 'confirmed') ?? [];
  const waitlist = d?.entries.filter(e => e.status === 'waitlist') ?? [];
  const field = 'w-full px-4 py-3 bg-background rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-primary/25';
  const set = (p: Partial<typeof cfg>) => { setCfg(c => ({ ...c, ...p })); setDirty(true); };

  return (
    <section className="bg-white rounded-[2rem] p-4 sm:p-6 shadow-sm border border-on-surface/5 space-y-4">
      <div>
        <h3 className="font-headline font-black text-lg flex items-center gap-2">📝 ลงชื่อล่วงหน้า</h3>
        <p className="text-xs font-semibold text-on-surface/50">ส่งลิงก์ให้ผู้เล่นลงชื่อเอง ครบจำนวนที่นั่งแล้วคนถัดไปเข้าคิวสำรองอัตโนมัติ และเลื่อนขึ้นเมื่อมีคนยกเลิก</p>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={cfg.open} onChange={e => { const n = { ...cfg, open: e.target.checked }; setCfg(n); save(n); }} className="w-5 h-5 accent-primary" />
        <span className="font-black text-sm">{cfg.open ? 'เปิดรับลงชื่ออยู่' : 'ปิดรับลงชื่อ'}</span>
      </label>

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="space-y-1"><span className="text-xs font-bold text-on-surface/50">จำนวนที่นั่ง{maxPlayers ? ` (สูงสุด ${maxPlayers})` : ''}</span>
          <input type="number" min={1} max={maxPlayers || 200} value={cfg.capacity} onChange={e => set({ capacity: Number(e.target.value) })} className={field} /></label>
        <label className="space-y-1 sm:col-span-2"><span className="text-xs font-bold text-on-surface/50">หัวข้อ เช่น ก๊วนวันอังคาร 19:00 สนาม ABC</span>
          <input value={cfg.title} maxLength={120} onChange={e => set({ title: e.target.value })} className={field} /></label>
      </div>
      <label className="space-y-1 block"><span className="text-xs font-bold text-on-surface/50">ข้อความถึงผู้เล่น (ไม่บังคับ)</span>
        <textarea value={cfg.note} maxLength={300} rows={2} onChange={e => set({ note: e.target.value })} className={field} /></label>
      <div className="flex items-center gap-3">
        <button disabled={!dirty} onClick={() => save()} className="px-5 py-2.5 rounded-xl bg-primary text-white font-black text-sm disabled:opacity-40">บันทึก</button>
        {msg && <span className="text-xs font-bold text-emerald-600">{msg}</span>}
      </div>

      <ShareLink url={link} title={cfg.title || 'ลงชื่อเล่นก๊วน'} caption="สแกนเพื่อลงชื่อ" filename="signup-qrcode.png" size={150} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-black text-sm">ลงชื่อแล้ว {confirmed.length}/{d?.capacity ?? cfg.capacity}{waitlist.length ? ` · สำรอง ${waitlist.length}` : ''}</p>
          <div className="flex gap-2">
            <button disabled={confirmed.length === 0} onClick={() => onImport(confirmed.map(e => e.name))} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-black disabled:opacity-40">นำเข้าเป็นผู้เล่นวันนี้</button>
            {d && d.entries.length > 0 && <button onClick={async () => { if (confirm('ล้างรายชื่อลงชื่อทั้งหมด?')) { await apiFetch('/signup/clear', { method: 'POST' }); load(true); } }} className="px-3 py-2 rounded-xl bg-background text-xs font-black text-on-surface/60">ล้างรายชื่อ</button>}
          </div>
        </div>
        {d && d.entries.length === 0 && <p className="text-xs font-semibold text-on-surface/40">ยังไม่มีใครลงชื่อ</p>}
        {d?.entries.map(e => (
          <div key={e.id} className="flex items-center gap-3 px-4 py-2 bg-background rounded-xl">
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${e.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{e.status === 'confirmed' ? e.position : `สำรอง ${e.position - d.capacity}`}</span>
            <div className="flex-1 min-w-0"><p className="font-black text-sm truncate">{e.name}</p>{e.contact && <p className="text-xs font-semibold text-on-surface/45 truncate">{e.contact}</p>}</div>
            <button onClick={() => remove(e)} aria-label="ลบ" className="p-1.5 rounded-lg text-on-surface/40 hover:text-red-500 hover:bg-red-50"><X size={15} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
