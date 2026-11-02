import React from 'react';
import { X } from 'lucide-react';
import { Rank, RANKS, RANK_COLORS } from '../types';
import { cn } from '../lib/utils';

// เลือกระดับมือด้วยปุ่มใหญ่ๆ แตะครั้งเดียวเสร็จ (แทน dropdown ของเบราว์เซอร์ที่เล็กและต้องเลื่อน)
// แถวละ 4 ปุ่มตามลำดับใน RANKS: P / S / S- / BG / VIP
export function RankPickerModal({ title, subtitle, current, onPick, onClose }: { title: string; subtitle?: string; current?: Rank; onPick: (r: Rank) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-[2rem] sm:rounded-[2rem] p-5 pb-7 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="ปิด" className="absolute top-3 right-3 p-2 rounded-full text-on-surface/40 hover:bg-background"><X size={18} /></button>
        <div className="pr-8">
          <h3 className="font-headline font-black text-lg truncate">{title}</h3>
          {subtitle && <p className="text-xs font-semibold text-on-surface/50">{subtitle}</p>}
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {RANKS.map(r => (
            <button key={r} onClick={() => onPick(r)}
              className={cn('h-14 rounded-2xl font-black text-lg transition-transform active:scale-90 hover:scale-105', RANK_COLORS[r], current === r && 'ring-4 ring-primary/40 ring-offset-2 scale-105')}>
              {r}
            </button>
          ))}
        </div>
        {current && <p className="text-center text-xs font-semibold text-on-surface/45">ระดับปัจจุบัน: {current}</p>}
      </div>
    </div>
  );
}
