import React, { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Rank, RANKS, RANK_COLORS, RANK_LEVEL_LABELS } from '../types';
import { useModalHotkeys } from '../hooks/useModalHotkeys';

interface Props {
  open: boolean;
  onClose: () => void;
  /** keepOpen = ใส่ชื่อต่อเนื่อง ไม่ปิดหน้าต่าง · คืน true ถ้าเพิ่มสำเร็จ */
  onAdd: (name: string, rank: Rank, keepOpen?: boolean) => boolean | void;
  existingNames: string[];
  rankMemory?: Record<string, Rank>;
}

export function AddMemberModal({ open, onClose, onAdd, existingNames, rankMemory = {} }: Props) {
  const [name, setName] = useState('');
  const [rank, setRank] = useState<Rank>('P');
  const [added, setAdded] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Enter already submits natively via the focused text input; add Esc to close.
  useModalHotkeys({ onClose, enabled: open });
  React.useEffect(() => { if (!open) setAdded([]); }, [open]);

  const validName = () => {
    const n = name.trim();
    if (!n) return null;
    if (existingNames.some(x => x.toLowerCase() === n.toLowerCase()) || added.some(x => x.toLowerCase() === n.toLowerCase())) {
      alert(`ชื่อ "${n}" มีอยู่ในรายการแล้วครับ!`);
      return null;
    }
    return n;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = validName();
    if (!n) return;
    onAdd(n, rank);
    setName('');
    setRank('P');
    setAdded([]);
  };

  // เพิ่มคนนี้แล้วเปิดหน้าต่างค้างไว้ ใส่ชื่อคนถัดไปได้เลย (ไม่ต้องเปิดใหม่ทีละคน)
  const addAndContinue = () => {
    const n = validName();
    if (!n) return;
    if (onAdd(n, rank, true) === false) return;
    setAdded(prev => [...prev, n]);
    setName('');
    setRank('P');
    inputRef.current?.focus();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-on-surface/50 backdrop-blur-sm" />
          <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white w-full max-w-md rounded-[2.5rem] p-8 relative z-10 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-headline font-black text-3xl tracking-tighter">ผู้เล่นใหม่</h2>
              <button onClick={onClose} className="p-2 hover:bg-background rounded-full transition-colors"><X size={24} /></button>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface/50 ml-2">ชื่อผู้เล่น</label>
                <input
                  ref={inputRef}
                  autoFocus required
                  value={name}
                  onChange={e => {
                    const val = e.target.value;
                    setName(val);
                    if (rankMemory[val]) {
                      setRank(rankMemory[val]);
                    }
                  }}
                  list="member-suggestions"
                  placeholder="ใส่ชื่อ..."
                  className="w-full px-6 py-4 bg-background border-none rounded-2xl focus:ring-2 focus:ring-primary/20 font-bold transition-all"
                />
                <datalist id="member-suggestions">
                  {Object.keys(rankMemory).map(n => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-on-surface/50 ml-2">ระดับมือ</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {RANKS.map(r => (
                    <label key={r} className="relative cursor-pointer">
                      <input type="radio" name="rank" value={r} checked={rank === r} onChange={() => setRank(r)} className="peer sr-only" />
                      <div className={cn(
                        'py-3 rounded-xl text-center font-black text-xs transition-all border-2 border-transparent peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary/20',
                        RANK_COLORS[r]
                      )}>
                        {r}
                      </div>
                    </label>
                  ))}
                </div>

              </div>

              {added.length > 0 && (
                <div className="rounded-2xl bg-primary/5 px-4 py-3">
                  <p className="text-xs font-black text-primary mb-1.5">เพิ่มแล้ว {added.length} คน</p>
                  <div className="flex flex-wrap gap-1.5">{added.map(n => <span key={n} className="px-2.5 py-1 rounded-full bg-white text-sm font-bold text-on-surface/70 border border-primary/10">{n} ✓</span>)}</div>
                </div>
              )}

              <div className="space-y-2 mt-2">
                <button type="button" onClick={addAndContinue} disabled={!name.trim()}
                  className="w-full bg-white text-primary border-2 border-primary/30 py-3.5 rounded-2xl font-black text-sm hover:bg-primary/5 active:scale-95 transition-all disabled:opacity-40">
                  + เพิ่มคนนี้ แล้วใส่คนต่อไป
                </button>
                <button type="submit"
                  className="w-full bg-primary text-white py-5 rounded-2xl font-headline font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all">
                  {added.length > 0 ? 'เช็คอินคนนี้ แล้วเสร็จ' : 'เช็คอินผู้เล่น'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
