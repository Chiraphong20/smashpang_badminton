import React, { useEffect, useState } from 'react';
import { MapPin, Clock, Wallet, Phone, ExternalLink, Search } from 'lucide-react';
import { cn } from '../lib/utils';
import { Listing, fetchListings, DAY_NAMES } from '../lib/api';
import { RANKS } from '../types';
import { authField } from './AuthShell';

// หน้าสาธารณะสำหรับนักแบดที่อยากหาก๊วนตี: /?find
export function FindGroups() {
  const [day, setDay] = useState<number | null>(null);
  const [level, setLevel] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Listing[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      fetchListings({ day, level, q }).then(r => {
        if (!alive) return;
        setFailed(r === null);
        setItems(r);
      });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [day, level, q]);

  return (
    <div className="min-h-screen bg-white">
      <header className="max-w-5xl mx-auto px-6 pt-8 flex items-center justify-between">
        <a href={window.location.pathname} className="text-sm font-bold text-gray-500 hover:text-gray-900">← กลับหน้าแรก</a>
        <span className="font-headline font-black text-xl text-primary">SmashPang</span>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <div className="space-y-2">
          <h1 className="font-headline font-black text-4xl text-gray-900">หาก๊วนตีแบด 🏸</h1>
          <p className="text-gray-500">เลือกวัน ระดับมือ แล้วดูว่าก๊วนไหนเปิดรับอยู่</p>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className={cn(authField, 'pl-12')} placeholder="ค้นหาชื่อก๊วน สถานที่ หรือพื้นที่" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip active={day === null} onClick={() => setDay(null)}>ทุกวัน</Chip>
            {DAY_NAMES.map((d, i) => <Chip key={d} active={day === i} onClick={() => setDay(day === i ? null : i)}>{d}</Chip>)}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-bold text-gray-600 shrink-0">ระดับมือของฉัน</label>
            <select value={level} onChange={e => setLevel(e.target.value)} className="px-4 py-2 rounded-xl border-2 border-gray-200 font-bold text-gray-800 bg-white">
              <option value="">ทุกระดับ</option>
              {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {failed && <p className="font-bold text-red-500">โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง</p>}
        {items === null && !failed && <p className="text-gray-400">กำลังโหลด...</p>}
        {items && items.length === 0 && (
          <p className="py-16 text-center text-gray-400">ยังไม่พบก๊วนที่ตรงกับเงื่อนไข ลองเปลี่ยนวันหรือระดับมือดู</p>
        )}

        <div className="grid md:grid-cols-2 gap-5">
          {items?.map((g, i) => <GroupCard key={`${g.name}-${i}`} g={g} day={day} />)}
        </div>
      </main>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn('px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all',
      active ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40')}>
      {children}
    </button>
  );
}

export function GroupCard({ g, day }: { g: Listing; day: number | null }) {
  const schedule = [...g.schedule].sort((a, b) => a.day - b.day);
  return (
    <article className="rounded-3xl border-2 border-gray-100 p-6 space-y-4 hover:border-primary/30 transition-all">
      <div>
        <h2 className="font-headline font-black text-2xl text-gray-900 break-words">{g.name}</h2>
        {g.description && <p className="text-sm text-gray-500 mt-1 break-words">{g.description}</p>}
      </div>

      <ul className="space-y-2 text-sm text-gray-700">
        <li className="flex gap-2"><MapPin size={16} className="mt-0.5 shrink-0 text-primary" />
          <span className="break-words">{g.venue}{g.area ? ` · ${g.area}` : ''}
            {g.mapUrl && <a href={g.mapUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 font-bold text-primary hover:underline">แผนที่ <ExternalLink size={12} /></a>}
          </span>
        </li>
        <li className="flex gap-2"><Clock size={16} className="mt-0.5 shrink-0 text-primary" />
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {schedule.map((s, i) => (
              <span key={i} className={cn(s.day === day && 'font-black text-primary')}>{DAY_NAMES[s.day]} {s.start}{s.end ? `–${s.end}` : ' เป็นต้นไป'}</span>
            ))}
          </span>
        </li>
        {g.price && <li className="flex gap-2"><Wallet size={16} className="mt-0.5 shrink-0 text-primary" /><span>{g.price}</span></li>}
        {g.contact && <li className="flex gap-2"><Phone size={16} className="mt-0.5 shrink-0 text-primary" /><span className="break-words">{g.contact}</span></li>}
      </ul>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold text-gray-400 mr-1">ระดับที่รับ</span>
        {g.levels.length === 0
          ? <span className="text-xs font-bold text-gray-600">ทุกระดับ</span>
          : g.levels.map(l => <span key={l} className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs font-black">{l}</span>)}
      </div>
    </article>
  );
}
