import React, { useState } from 'react';
import { ArrowRight, Check, Pencil } from 'lucide-react';
import { SessionMode, ModeConfig, MODE_LABELS, MODE_THEME } from '../types';
import { cn } from '../lib/utils';
import { DAY_NAMES, ListingSlot } from '../lib/api';

const MODES = Object.keys(MODE_LABELS) as SessionMode[];

// ตั้งชื่อก๊วน — โชว์ครั้งแรกที่เข้าก๊วนที่เพิ่งสร้าง (ชื่อยังเป็นรหัสก๊วนอยู่)
export function GroupNameSetup({ onSave }: { onSave: (name: string, slot: ListingSlot | null) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const [day, setDay] = useState('');  // '' = ไม่ระบุเวลาจัดก๊วน
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('21:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setError('');
    const slot = day !== '' && start ? { day: Number(day), start, end } : null;
    if (!(await onSave(name.trim(), slot))) setError('บันทึกชื่อไม่สำเร็จ ลองใหม่อีกครั้ง');
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[500] bg-primary/80 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto">
      <form onSubmit={submit} className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden">
        <img src="/setup-name.png" alt="" className="w-full -mb-6 select-none pointer-events-none" draggable={false} />
        <div className="relative px-10 pb-8 space-y-5">
          <div className="text-center space-y-1">
            <h2 className="font-headline font-black text-3xl text-primary">ตั้งชื่อก๊วนของคุณ</h2>
            <p className="text-sm text-on-surface/50">ชื่อนี้จะแสดงในระบบและจอคิว เปลี่ยนภายหลังได้</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-black text-primary">ชื่อก๊วน</label>
            <div className="relative">
              <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="เช่น ก๊วนวันอังคาร"
                className="w-full pl-6 pr-14 py-4 bg-teal-50 rounded-2xl font-headline font-black text-xl text-primary placeholder:text-primary/30 border-2 border-teal-400 focus:outline-none focus:ring-4 focus:ring-teal-400/20" />
              <Pencil size={20} className="absolute right-5 top-1/2 -translate-y-1/2 text-primary/60" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-black text-primary">เวลาจัดก๊วน <span className="font-bold text-on-surface/40">(ไม่บังคับ)</span></label>
            <div className="flex flex-wrap items-center gap-2">
              <select value={day} onChange={e => setDay(e.target.value)}
                className="px-4 py-3 bg-teal-50 rounded-xl font-bold text-primary border-2 border-teal-200 focus:outline-none focus:border-teal-400">
                <option value="">ไม่ระบุ</option>
                {DAY_NAMES.map((d, n) => <option key={d} value={n}>วัน{d}</option>)}
              </select>
              {day !== '' && (
                <>
                  <input type="time" value={start} onChange={e => setStart(e.target.value)} className="px-3 py-3 bg-teal-50 rounded-xl font-bold text-primary border-2 border-teal-200 focus:outline-none focus:border-teal-400" />
                  <span className="font-bold text-on-surface/40">–</span>
                  <input type="time" value={end} onChange={e => setEnd(e.target.value)} className="px-3 py-3 bg-teal-50 rounded-xl font-bold text-primary border-2 border-teal-200 focus:outline-none focus:border-teal-400" />
                </>
              )}
            </div>
            {day !== '' && <p className="text-xs text-on-surface/40">เว้นเวลาจบว่าง = "เป็นต้นไป" · เพิ่มวันอื่นได้ภายหลังที่หน้าประกาศหาสมาชิก</p>}
          </div>
          {error && <p className="text-sm font-bold text-red-500 text-center">{error}</p>}
          <button disabled={busy || !name.trim()} className="w-full py-4 rounded-2xl text-white font-headline font-black text-lg disabled:opacity-40 flex items-center justify-center gap-3 hover:brightness-110 transition-all"
            style={{ background: 'linear-gradient(90deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 80%, #3b5bdb))' }}>
            {busy ? 'กำลังบันทึก...' : <>ตั้งชื่อและเริ่มใช้งาน <ArrowRight size={20} /></>}
          </button>
          <p className="text-center text-sm text-on-surface/40">พร้อมแล้ว ชวนเพื่อนมาสนุกด้วยกัน</p>
        </div>
      </form>
    </div>
  );
}

// คำอธิบายสั้นบนการ์ดเลือกโหมด
const MODE_SHORT: Record<SessionMode, string> = {
  perGame: 'ค่าคอร์ด + ค่าลูก ตามเกมที่ตี',
  buffet: 'ราคาเดียว เล่นได้ตลอดช่วงก๊วน',
  split: 'รวมค่าสนามและค่าลูก หารทุกคนเท่ากัน',
  fun: 'สุ่มจับคู่เล่นสนุก ไม่มีการคิดเงิน',
};

// ครบโควตาจำนวนครั้งที่จัดก๊วนต่อเดือนของแพ็กเกจ — กันไม่ให้เริ่มวันใหม่ (ดูข้อมูลย้อนหลังได้ตามปกติ)
export function QuotaBlock({ message, onDismiss, onLogout }: { message: string; onDismiss: () => void; onLogout: () => void }) {
  return (
    <div className="fixed inset-0 z-[450] bg-primary/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white rounded-[2rem] w-full max-w-md p-7 text-center space-y-4 shadow-2xl">
        <div className="text-5xl">🔒</div>
        <h2 className="font-headline font-black text-2xl text-primary">ครบโควตาเดือนนี้แล้ว</h2>
        <p className="text-sm text-on-surface/60 font-semibold">{message}</p>
        <p className="text-xs text-on-surface/40">อัปเกรดแพ็กเกจเพื่อจัดก๊วนเพิ่ม หรือรอเริ่มเดือนใหม่ ดูข้อมูลย้อนหลังและสถิติได้ตามปกติ</p>
        <div className="flex gap-3 pt-1">
          <button onClick={onLogout} className="flex-1 py-3 rounded-xl bg-background font-black text-sm text-on-surface/60">ออกจากระบบ</button>
          <button onClick={onDismiss} className="flex-[2] py-3 rounded-xl bg-primary text-white font-black text-sm">ดูข้อมูลย้อนหลัง</button>
        </div>
      </div>
    </div>
  );
}

// เลือกรูปแบบก๊วนของวันนี้ — เปิดให้เลือกได้ทั้ง 4 โหมด แต่ละโหมดมีสีและตัวการ์ตูนประจำตัว
export function ModePicker({ initialConfig, onPick, allowedModes }: { initialConfig: ModeConfig; onPick: (mode: SessionMode, config: Partial<ModeConfig>) => void; allowedModes?: SessionMode[] }) {
  const isAllowed = (m: SessionMode) => !allowedModes || allowedModes.includes(m);
  const [selected, setSelected] = useState<SessionMode>(() => MODES.find(isAllowed) ?? 'perGame');
  const [buffetPrice, setBuffetPrice] = useState(initialConfig.buffetPrice);
  const theme = MODE_THEME[selected];

  return (
    <div className="fixed inset-0 z-[450] bg-primary/80 backdrop-blur-sm">
      <div className="h-full flex items-center justify-center p-3 md:p-6">
        <div className="w-full max-w-5xl max-h-full bg-white rounded-[2rem] shadow-2xl p-5 md:p-6 flex flex-col gap-4 overflow-hidden">
          <div className="text-center shrink-0">
            <h2 className="font-headline font-black text-2xl md:text-3xl text-primary">วันนี้จัดก๊วนแบบไหน?</h2>
            <p className="text-xs md:text-sm text-on-surface/50">เลือกรูปแบบก๊วนที่เหมาะกับวันนี้</p>
          </div>

          <div className="grid md:grid-cols-[18rem_1fr] gap-4 flex-1 min-h-0">
            <div className="grid grid-cols-2 md:grid-cols-1 md:grid-rows-4 gap-3 min-h-0">
              {MODES.map(m => {
                const t = MODE_THEME[m];
                const on = selected === m;
                const locked = !isAllowed(m);
                return (
                  <button key={m} onClick={() => !locked && setSelected(m)} aria-pressed={on} disabled={locked} title={locked ? 'แพ็กเกจของคุณยังไม่รองรับโหมดนี้' : undefined}
                    className={cn('relative flex items-center gap-3 text-left rounded-2xl p-3 pr-2 border-2 transition-all hover:shadow-md active:scale-[0.99] overflow-hidden', locked && 'opacity-45 grayscale cursor-not-allowed hover:shadow-none')}
                    style={{ borderColor: on ? t.color : '#e5e7eb', backgroundColor: on ? t.soft : '#fff' }}>
                    <span className="w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center" style={{ borderColor: t.color, backgroundColor: on ? t.color : 'transparent' }}>
                      {on && <Check size={14} className="text-white" strokeWidth={4} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-headline font-black text-lg leading-tight" style={{ color: t.color }}>{MODE_LABELS[m]}{locked && <span className="ml-1.5 text-xs">🔒</span>}</span>
                      <span className="block text-[11px] leading-snug text-on-surface/60">{locked ? 'อัปเกรดแพ็กเกจเพื่อใช้โหมดนี้' : MODE_SHORT[m]}</span>
                    </span>
                    <img src={`/modes/${m}-mascot.webp`} alt="" className="w-14 h-14 object-contain shrink-0 hidden sm:block" draggable={false} />
                  </button>
                );
              })}
            </div>

            <div className="rounded-3xl border-2 overflow-hidden flex flex-col min-h-0" style={{ borderColor: theme.soft }}>
              <img key={selected} src={`/modes/${selected}-scene.jpg`} alt={MODE_LABELS[selected]} className="w-full flex-1 min-h-0 object-cover" draggable={false} />
              <div className="p-4 space-y-1 shrink-0" style={{ backgroundColor: theme.soft }}>
                <h3 className="font-headline font-black text-xl" style={{ color: theme.color }}>{MODE_LABELS[selected]}</h3>
                <p className="text-sm text-on-surface/70">{theme.desc}</p>
                {selected === 'buffet' && (
                  <label className="flex items-center gap-3 pt-1">
                    <span className="text-sm font-bold" style={{ color: theme.color }}>ราคาบุฟเฟต์ต่อคน (฿)</span>
                    <input type="number" min={0} value={buffetPrice} onChange={e => setBuffetPrice(Math.max(0, Number(e.target.value) || 0))}
                      className="w-32 px-4 py-2 rounded-xl bg-white text-on-surface font-headline font-black text-lg focus:outline-none focus:ring-2" style={{ ['--tw-ring-color' as string]: theme.color }} />
                  </label>
                )}
              </div>
            </div>
          </div>

          <button onClick={() => onPick(selected, selected === 'buffet' ? { buffetPrice } : {})}
            className="w-full py-3.5 shrink-0 rounded-2xl font-headline font-black text-lg text-white flex items-center justify-center gap-3 hover:brightness-110 transition-all"
            style={{ backgroundColor: theme.color }}>
            ยืนยันรูปแบบก๊วน <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
