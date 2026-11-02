import React, { useEffect, useState } from 'react';
import { getGroupId } from '../lib/api';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface Entry { id: string; name: string; status: 'confirmed' | 'waitlist'; position: number }
interface Data { groupName: string; open: boolean; capacity: number; title: string; note: string; entries: Entry[] }

const mineKey = (gid: string) => `sp_signup_${gid}`;
const readMine = (gid: string): { id: string; token: string } | null => { try { return JSON.parse(localStorage.getItem(mineKey(gid)) || 'null'); } catch { return null; } };

const ERR: Record<string, string> = {
  duplicate: 'ชื่อนี้ลงชื่อไว้แล้ว — ถ้าเป็นคนละคน ลองเพิ่มนามสกุลหรือเลขท้าย',
  closed: 'ปิดรับลงชื่อแล้ว',
  full: 'รายชื่อเต็มแล้ว',
  too_many_attempts: 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่',
  invalid_name: 'กรอกชื่อ (ไม่เกิน 30 ตัวอักษร)',
};

// หน้าลงชื่อล่วงหน้า (ไม่ต้องล็อกอิน) — ?g=รหัสก๊วน&signup
export function SignupPage() {
  const gid = getGroupId();
  const base = `${API_BASE}/api/g/${encodeURIComponent(gid)}/signup`;
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mine, setMine] = useState(() => readMine(gid));

  const load = async () => {
    try {
      const res = await fetch(base);
      if (res.status === 404) { setMissing(true); return; }
      if (res.ok) setData(await res.json());
    } catch { /* retry on next tick */ }
  };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ถ้ารายชื่อของเราถูกเจ้าของลบออก ให้ล้างสถานะ "ลงชื่อแล้ว" ในเครื่อง
  useEffect(() => {
    if (data && mine && !data.entries.some(e => e.id === mine.id)) {
      try { localStorage.removeItem(mineKey(gid)); } catch { /* ignore */ }
      setMine(null);
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, contact }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(ERR[j.error] || 'ลงชื่อไม่สำเร็จ ลองใหม่อีกครั้ง'); }
      else {
        const m = { id: j.id, token: j.cancelToken };
        try { localStorage.setItem(mineKey(gid), JSON.stringify(m)); } catch { /* ignore */ }
        setMine(m); setName(''); setContact('');
      }
    } catch { setError('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง'); }
    setBusy(false);
    load();
  };

  const cancel = async () => {
    if (!mine || !confirm('ยกเลิกการลงชื่อใช่ไหม?')) return;
    await fetch(`${base}/${mine.id}?token=${encodeURIComponent(mine.token)}`, { method: 'DELETE' });
    try { localStorage.removeItem(mineKey(gid)); } catch { /* ignore */ }
    setMine(null); load();
  };

  if (missing) return <div className="min-h-screen bg-background flex items-center justify-center p-6"><p className="font-bold text-on-surface/50">ไม่พบก๊วนนี้</p></div>;
  if (!data) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-4xl animate-pulse">🏸</div></div>;

  const confirmed = data.entries.filter(e => e.status === 'confirmed');
  const waitlist = data.entries.filter(e => e.status === 'waitlist');
  const me = mine ? data.entries.find(e => e.id === mine.id) : null;
  const left = Math.max(0, data.capacity - confirmed.length);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-on-surface/5 text-center space-y-2">
          <div className="text-4xl">🏸</div>
          <h1 className="font-headline font-black text-2xl">{data.groupName}</h1>
          {data.title && <p className="font-bold text-primary">{data.title}</p>}
          {data.note && <p className="text-sm font-semibold text-on-surface/55 whitespace-pre-line">{data.note}</p>}
          <div className="flex justify-center gap-2 pt-1 text-xs font-black">
            <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700">ลงชื่อแล้ว {confirmed.length}/{data.capacity}</span>
            {left > 0 && data.open ? <span className="px-3 py-1.5 rounded-full bg-sky-50 text-sky-700">ว่าง {left} ที่</span> : <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700">คิวสำรอง {waitlist.length}</span>}
          </div>
        </div>

        {me ? (
          <div className={`rounded-[2rem] p-5 text-center space-y-2 border-2 ${me.status === 'confirmed' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <p className="font-headline font-black text-lg">{me.status === 'confirmed' ? `✅ ลงชื่อสำเร็จ — ${me.name}` : `⏳ ${me.name} อยู่คิวสำรองลำดับที่ ${me.position - data.capacity}`}</p>
            <p className="text-xs font-semibold text-on-surface/55">{me.status === 'confirmed' ? 'เจอกันที่สนามนะ ถ้ามาไม่ได้กดยกเลิกเพื่อให้คนอื่นได้ที่' : 'ถ้ามีคนยกเลิก ระบบจะเลื่อนคุณขึ้นอัตโนมัติ เปิดหน้านี้ดูสถานะได้ตลอด'}</p>
            <button onClick={cancel} className="text-sm font-black text-red-500 underline">ยกเลิกการลงชื่อ</button>
          </div>
        ) : data.open ? (
          <form onSubmit={submit} className="bg-white rounded-[2rem] p-5 shadow-sm border border-on-surface/5 space-y-3">
            <p className="font-headline font-black text-lg">{left > 0 ? 'ลงชื่อเล่นก๊วน' : 'เต็มแล้ว — ลงชื่อเป็นตัวสำรอง'}</p>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={30} placeholder="ชื่อ / ชื่อเล่น" className="w-full px-4 py-3 bg-background rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-primary/25" />
            <input value={contact} onChange={e => setContact(e.target.value)} maxLength={60} placeholder="เบอร์/LINE ติดต่อ (ไม่บังคับ — เห็นเฉพาะผู้จัด)" className="w-full px-4 py-3 bg-background rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-primary/25" />
            {error && <p className="text-xs font-bold text-red-500">{error}</p>}
            <button disabled={busy || !name.trim()} className="w-full py-3.5 rounded-xl bg-primary text-white font-black disabled:opacity-40">{busy ? 'กำลังลงชื่อ...' : 'ลงชื่อ'}</button>
          </form>
        ) : (
          <div className="bg-white rounded-[2rem] p-5 text-center shadow-sm border border-on-surface/5"><p className="font-bold text-on-surface/50">ตอนนี้ปิดรับลงชื่อ</p></div>
        )}

        <div className="bg-white rounded-[2rem] p-5 shadow-sm border border-on-surface/5 space-y-3">
          <p className="font-headline font-black">รายชื่อ ({confirmed.length})</p>
          {confirmed.length === 0 && <p className="text-xs font-semibold text-on-surface/40">ยังไม่มีใครลงชื่อ</p>}
          <ol className="space-y-1.5">
            {confirmed.map(e => <li key={e.id} className={`flex gap-3 text-sm font-bold ${e.id === mine?.id ? 'text-primary' : ''}`}><span className="w-6 text-on-surface/35">{e.position}.</span>{e.name}</li>)}
          </ol>
          {waitlist.length > 0 && (
            <>
              <p className="font-headline font-black pt-2">คิวสำรอง ({waitlist.length})</p>
              <ol className="space-y-1.5">
                {waitlist.map(e => <li key={e.id} className={`flex gap-3 text-sm font-bold text-on-surface/60 ${e.id === mine?.id ? 'text-primary' : ''}`}><span className="w-6 text-on-surface/35">{e.position - data.capacity}.</span>{e.name}</li>)}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
