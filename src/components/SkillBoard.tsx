import React, { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { format } from 'date-fns';
import { ImageDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { initialOf } from './Avatar';
import { Member, PlayerProfile, Rank, RANKS, RANK_WEIGHTS, RANK_LEVEL_LABELS } from '../types';

interface Props {
  members: Member[];
  profiles: Record<string, PlayerProfile>;
  groupName: string;
  onOpenProfile?: (id: string) => void;
}

// สีประจำกลุ่มระดับมือ (P/N · S · BG · VIP)
const family = (r: Rank) => (r.startsWith('VIP') ? 'vip' : r.startsWith('BG') ? 'bg' : r.startsWith('S') ? 's' : 'p');
const FAM = {
  p: { head: 'from-indigo-500 to-blue-500', tile: 'from-indigo-400 to-blue-500', ring: 'border-indigo-200', soft: 'bg-indigo-50' },
  s: { head: 'from-teal-500 to-emerald-500', tile: 'from-teal-400 to-emerald-500', ring: 'border-teal-200', soft: 'bg-teal-50' },
  bg: { head: 'from-amber-500 to-orange-500', tile: 'from-amber-400 to-orange-500', ring: 'border-amber-200', soft: 'bg-amber-50' },
  vip: { head: 'from-rose-500 to-pink-500', tile: 'from-rose-400 to-pink-500', ring: 'border-rose-200', soft: 'bg-rose-50' },
} as const;

// แผงตารางระดับมือ — จัดกลุ่มผู้เล่นของก๊วนนี้ตามระดับมือ (มือสูง → ต่ำ) พร้อมรูปโปรไฟล์ บันทึกเป็นรูปแชร์ได้
export function SkillBoard({ members, profiles, groupName, onOpenProfile }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const levels = [...RANKS].sort((a, b) => RANK_WEIGHTS[b] - RANK_WEIGHTS[a])
    .map(r => ({ rank: r, list: members.filter(m => m.rank === r).sort((a, b) => a.name.localeCompare(b.name, 'th')) }))
    .filter(l => l.list.length > 0);

  const save = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, backgroundColor: '#eaf3ff', cacheBust: false });
      const a = document.createElement('a');
      a.href = url;
      a.download = `ตารางระดับมือ-${groupName}.png`;
      a.click();
    } catch {
      alert('บันทึกรูปไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
    setBusy(false);
  };

  if (members.length === 0) {
    return <div className="bg-white rounded-3xl p-10 text-center text-on-surface/40 font-bold">ยังไม่มีสมาชิกในก๊วน — เพิ่มสมาชิกก่อนแล้วตารางระดับมือจะขึ้นที่นี่</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-on-surface/55">จัดกลุ่มตามระดับมือของผู้เล่นในก๊วนนี้ · แก้ระดับมือได้ที่มุมการ์ดสมาชิก · ใส่รูปได้ที่ "โปรไฟล์"</p>
        <button onClick={save} disabled={busy}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
          <ImageDown size={16} /> {busy ? 'กำลังสร้างรูป...' : 'บันทึกเป็นรูป'}
        </button>
      </div>

      <div ref={ref} className="rounded-[2rem] p-4 sm:p-6 space-y-5 max-w-3xl mx-auto" style={{ background: 'linear-gradient(160deg,#eaf3ff,#dbeafe 60%,#e0f2fe)' }}>
        <div className="text-center space-y-1 pt-1">
          <p className="text-xs font-black tracking-widest text-primary/70">SMASHPANG · {format(new Date(), 'dd/MM/yyyy')}</p>
          <h3 className="font-headline font-black text-2xl sm:text-3xl text-primary">ตารางระดับมือ</h3>
          <p className="font-bold text-on-surface/60">{groupName} · {members.length} คน</p>
        </div>

        {levels.map(({ rank, list }) => {
          const f = FAM[family(rank)];
          return (
            <section key={rank} className={cn('rounded-[1.75rem] bg-white/90 border-2 p-3 sm:p-4 shadow-sm', f.ring)}>
              <div className="flex justify-center -mt-7 mb-3">
                <span className={cn('px-6 py-1.5 rounded-2xl text-white font-headline font-black text-lg sm:text-xl shadow-md bg-gradient-to-r', f.head)}>
                  มือ {rank}{RANK_LEVEL_LABELS[rank] ? ` · ${RANK_LEVEL_LABELS[rank]}` : ''} <span className="text-sm font-bold opacity-80">({list.length})</span>
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {list.map((m, i) => {
                  const pr = profiles[m.id];
                  return (
                    <button key={m.id} type="button" onClick={() => onOpenProfile?.(m.id)}
                      className="relative aspect-square rounded-2xl overflow-hidden border-2 border-white shadow-md text-left">
                      {pr?.avatar
                        ? <img src={pr.avatar} alt={m.name} draggable={false} className="w-full h-full object-cover" />
                        : <div className={cn('w-full h-full flex items-center justify-center text-white font-headline font-black text-3xl sm:text-4xl bg-gradient-to-br', f.tile)}>{initialOf(m.name)}</div>}
                      <span className="absolute left-1.5 top-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-white/95 text-[11px] font-black text-primary flex items-center justify-center shadow">{i + 1}</span>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent pt-6 pb-1.5 px-1.5 text-white text-center">
                        <p className="font-black text-[11px] sm:text-sm leading-tight truncate">{m.name}</p>
                        {pr?.nickname && <p className="text-[9px] sm:text-[11px] font-semibold opacity-85 leading-tight truncate">“{pr.nickname}”</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        <p className="text-center text-[11px] font-bold text-primary/50 pb-1">smashpang.duckdns.org</p>
      </div>
    </div>
  );
}
