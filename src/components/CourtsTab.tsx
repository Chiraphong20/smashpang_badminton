import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bolt, X, Plus, Trash2, ShoppingCart, Search, Check, RotateCcw, Lock, ChevronDown, ChevronRight, RefreshCw, Wand2, ArrowDownWideNarrow, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Member, Court, Snack, GameRecord, Rank, RANKS, RANK_WEIGHTS, RANK_COLORS, RANK_LEVEL_LABELS, CourtQueueSlot, QueuePlayer, SessionMode, PlayerProfile } from '../types';
import { format } from 'date-fns';
import { POSModal } from './POSModal';
import { PlayerBadge } from './Avatar';
import { ShuttleIcon } from './ShuttleIcon';
import { useModalHotkeys } from '../hooks/useModalHotkeys';

let draggingPlayerId: string | null = null;

// อักษรย่อในวงกลมอวาตาร์ — ข้ามสระหน้า (เ แ โ ใ ไ) ภาษาไทยเอาตัวแรก ภาษาอังกฤษเอา 2 ตัว
const initials = (name: string) => {
  const t = Array.from(name.trim().replace(/^[เแโใไ]+/, ''));
  if (t.length === 0) return '?';
  return /[A-Za-z]/.test(t[0]) ? t.slice(0, 2).join('').toUpperCase() : t[0];
};

// ป้ายระดับมือ (pill) — P/N ฟ้า-น้ำเงิน, S เขียวอมฟ้า, BG เหลือง, VIP ชมพู
const rankPill = (rank: Rank) =>
  rank === 'P+' ? 'bg-sky-100 text-sky-700 border-sky-200'
    : rank.startsWith('P') || rank === 'N' ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
      : rank.startsWith('S') ? 'bg-teal-100 text-teal-700 border-teal-200'
        : rank.startsWith('BG') ? 'bg-amber-100 text-amber-700 border-amber-200'
          : 'bg-rose-100 text-rose-700 border-rose-200';

// ไอคอนสนามแบบเปอร์สเปคทีฟ — เขียว (จัดทีม) / ส้ม (กำลังเล่น) / เทา (ว่าง)
function CourtIcon({ tone }: { tone: 'green' | 'orange' | 'gray' }) {
  const fill = tone === 'green' ? '#14a37f' : tone === 'orange' ? '#f97316' : '#64748b';
  return (
    <svg viewBox="0 0 120 80" className="w-16 h-11 shrink-0" aria-hidden>
      <polygon points="24,8 100,8 116,70 4,70" fill={fill} />
      <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" opacity="0.95">
        <polygon points="27,13 97,13 111,65 9,65" />
        <line x1="60" y1="13" x2="60" y2="65" />
        <line x1="18" y1="39" x2="102" y2="39" strokeWidth="3.2" />
        <line x1="22" y1="26" x2="98" y2="26" />
        <line x1="14" y1="52" x2="106" y2="52" />
      </g>
    </svg>
  );
}

interface Props {
  profiles?: Record<string, PlayerProfile>;
  /** เปิดหน้านี้พร้อมเลือกคอร์ทนี้ (เช่นกดมาจากการ์ดในหน้าหลัก) */
  focusCourtId?: string | null;
  members: Member[];
  courts: Court[];
  snacks: Snack[];
  searchQuery: string;
  gameHistory: GameRecord[];
  onAutoMatch: (courtId: string) => void;
  onStartGame: (courtId: string) => void;
  onResetCourt: (courtId: string, score?: { scoreA: number; scoreB: number }) => void;
  sessionMode: SessionMode;
  askScore: boolean;
  shuttleChargePerShuttle: number;
  onRemovePlayer: (courtId: string, slotIndex: number) => void;
  onAddPlayer: (courtId: string, slotIndex: number, playerId: string) => void;
  onDeleteCourt: (courtId: string) => void;
  onAddSnack: (memberId: string, snacks: Snack[]) => void;
  /** แพ็กเกจเปิดใช้สินค้าหรือไม่ (ไม่ส่ง = เปิด) */
  productsOn?: boolean;
  onEditGame: (gameId: string, newShuttles: number) => void;
  onUndoGame: (gameId: string) => void;
  onUpdateCourt: React.Dispatch<React.SetStateAction<Court[]>>;
  minRankFilter: Rank;
  setMinRankFilter: (r: Rank) => void;
  maxRankFilter: Rank;
  setMaxRankFilter: (r: Rank) => void;
  onAddCourt: () => void;
  courtQueues: Record<string, CourtQueueSlot[]>;
  onAddCourtQueue: (courtId: string, slot: CourtQueueSlot) => void;
  onRemoveCourtQueue: (courtId: string, slotId: string) => void;
  onUpdateCourtQueue: (courtId: string, slot: CourtQueueSlot) => void;
  onMoveCourtQueue: (courtId: string, slotId: string, dir: 'up' | 'down') => void;
  /** ลัดคิว: ย้ายผู้เล่นของคิวที่เลือกลงคอร์ทนี้ทันที */
  onUseQueueSlot: (courtId: string, slot: CourtQueueSlot, sourceCourtId: string) => void;
}

// ── Player Picker ─────────────────────────────────────────────────────────────
export function PlayerPicker({ members, currentPlayerId, onSelect, onClose, position, profiles = {}, pickAll = false, sheet = false }: {
  /** แก้เกมย้อนหลัง: เลือกได้ทุกคน ไม่จำกัดเฉพาะคนที่รอคิว */
  pickAll?: boolean;
  /** แสดงเป็นแผงเลื่อนจากด้านล่างทุกขนาดจอ (ใช้ในหน้าต่างที่มี overflow) */
  sheet?: boolean;
  profiles?: Record<string, PlayerProfile>;
  members: Member[];
  currentPlayerId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  position: 'top' | 'bottom';
}) {
  const [q, setQ] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { ref.current?.focus(); }, []);

  const list = members.filter(m =>
    (pickAll || m.status === 'waiting' || m.id === currentPlayerId) &&
    m.name.toLowerCase().includes(q.toLowerCase())
  );

  // "นำออกจากสล็อต" counts as nav item 0 when it's shown, so arrow/Enter can reach it too
  const navCount = (currentPlayerId ? 1 : 0) + list.length;
  useEffect(() => { setHighlightedIndex(0); }, [q]);
  // เลื่อนรายการตามไปหาแถวที่ไฮไลต์อยู่เสมอ กันกรณีลูกศรเลื่อนไปแถวที่ยังไม่โผล่ในจอ
  useEffect(() => {
    itemRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);
  const selectHighlighted = () => {
    if (currentPlayerId && highlightedIndex === 0) { onSelect(null); onClose(); return; }
    const m = list[highlightedIndex - (currentPlayerId ? 1 : 0)];
    if (m) { onSelect(m.id); onClose(); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: position === 'top' ? -10 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: position === 'top' ? -10 : 10 }}
      transition={{ duration: 0.12 }}
      onClick={e => e.stopPropagation()}
      className={cn(
        "absolute left-0 right-0 z-50 bg-white rounded-2xl shadow-2xl border border-on-surface/5 overflow-hidden",
        sheet
          ? "fixed inset-x-0 bottom-0 top-auto z-[400] rounded-b-none sm:max-w-xl sm:mx-auto shadow-[0_-12px_40px_rgba(0,0,0,0.25)]"
          : "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:mt-0 max-sm:mb-0 max-sm:z-[300] max-sm:rounded-b-none max-sm:shadow-[0_-12px_40px_rgba(0,0,0,0.25)]",
        !sheet && (position === 'top' ? "top-full mt-2" : "bottom-full mb-2")
      )}
    >
      <div className="p-3 border-b border-on-surface/5">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/30" />
          <input ref={ref} value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อ..."
            onKeyDown={e => {
              if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
              if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setHighlightedIndex(i => Math.min(i + 1, navCount - 1)); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setHighlightedIndex(i => Math.max(i - 1, 0)); return; }
              if (e.key !== 'Enter') return;
              e.preventDefault(); e.stopPropagation();
              selectHighlighted();
            }}
            className="w-full pl-9 pr-3 py-2.5 bg-background rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>
      <div className="max-h-60 max-sm:max-h-[55vh] overflow-y-auto">
        {currentPlayerId && (
          <button ref={el => { itemRefs.current[0] = el; }} onClick={() => { onSelect(null); onClose(); }}
            onMouseEnter={() => setHighlightedIndex(0)}
            className={cn('w-full flex items-center gap-3 px-4 py-3 hover:bg-error/5 text-error transition-colors', highlightedIndex === 0 && 'bg-error/5 ring-2 ring-inset ring-error/20')}>
            <X size={15} /><span className="text-sm font-black">นำออกจากสล็อต</span>
          </button>
        )}
        {list.length === 0 && <p className="text-center py-6 text-sm text-on-surface/30 font-bold">ไม่พบผู้เล่น</p>}
        {list.map((m, i) => {
          const navIndex = i + (currentPlayerId ? 1 : 0);
          return (
          <button key={m.id} ref={el => { itemRefs.current[navIndex] = el; }} onClick={() => { onSelect(m.id); onClose(); }}
            onMouseEnter={() => setHighlightedIndex(navIndex)}
            className={cn('w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/5 transition-colors',
              m.id === currentPlayerId ? 'bg-primary/5' : '',
              navIndex === highlightedIndex && 'bg-primary/5 ring-2 ring-inset ring-primary/20')}>
            <PlayerBadge rank={m.rank} name={m.name} profile={profiles[m.id]} className="w-10 h-10 rounded-xl text-sm" />
            <div className="flex-1 text-left min-w-0">
              <p className="font-bold truncate">{m.name}</p>
              <p className="text-xs text-on-surface/40">
                {RANK_LEVEL_LABELS[m.rank]}{RANK_LEVEL_LABELS[m.rank] ? ' · ' : ''}{m.gamesPlayed} เกม
              </p>
            </div>
            {m.id === currentPlayerId && <Check size={15} className="text-primary shrink-0" />}
          </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Player Modal Picker (กลางจอ · เลือกได้หลายคนทีเดียว) ──────────────────────────
// ใช้ตอนเอาคนลงคอร์ด: แตะช่องว่างแล้วเลือกชื่อหลายคนในหน้าต่างเดียว (สูงสุดเท่าช่องว่าง) แล้วกดตกลง
// ไม่เด้งคีย์บอร์ดบนมือถือเอง (จอไม่ขยับ) — แตะช่องค้นหาเองเมื่ออยากพิมพ์
// กลุ่มระดับมือสำหรับตัวกรองในหน้าต่างเลือกผู้เล่น
const RANK_GROUPS: { id: string; label: string; ranks: Rank[] }[] = [
  { id: 'P', label: 'P / N', ranks: RANKS.slice(0, 4) },
  { id: 'S', label: 'S', ranks: RANKS.slice(4, 7) },
  { id: 'S-', label: 'S-', ranks: RANKS.slice(7, 10) },
  { id: 'BG', label: 'BG', ranks: RANKS.slice(10, 13) },
  { id: 'VIP', label: 'VIP', ranks: RANKS.slice(13) },
];

export function PlayerModalPicker({ members, profiles = {}, currentPlayerId = null, max, slots, pickAll = false, onConfirm, onRemove, onClose }: {
  /** แสดงทุกคนไม่ว่าสถานะ (ใช้ตอนจัดคิว: คนที่กำลังเล่นอยู่ก็ใส่คิวได้) */
  pickAll?: boolean;
  members: Member[];
  /** ผู้เล่นปัจจุบันในช่อง 1-4 ของคอร์ด (ช่อง 1-2 = ทีม A, 3-4 = ทีม B) ใช้โชว์ว่าคนที่ติ๊กจะอยู่ทีมไหนกับใคร */
  slots?: (string | null)[];
  profiles?: Record<string, PlayerProfile>;
  /** คนที่อยู่ในช่องนี้อยู่แล้ว (โหมดเปลี่ยนคน: เลือกทีละคน) */
  currentPlayerId?: string | null;
  /** เลือกได้อีกกี่คน (ช่องว่างที่เหลือ) */
  max: number;
  onConfirm: (ids: string[]) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [hi, setHi] = useState(0);
  const single = max <= 1;
  const searchRef = useRef<HTMLInputElement>(null);
  // เครื่องที่มีเมาส์/คีย์บอร์ดจริง (คอม) โฟกัสช่องค้นหาให้เลย · มือถือไม่โฟกัส เพื่อไม่ให้แป้นพิมพ์เด้งขึ้นมาบังรายชื่อ
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches) searchRef.current?.focus();
  }, []);

  // ตัวกรองระดับมือ (เลือกได้หลายกลุ่ม · ไม่เลือก = ทั้งหมด)
  const [rankGroups, setRankGroups] = useState<string[]>([]);
  const pool = members.filter(m => pickAll || m.status === 'waiting' || m.id === currentPlayerId);
  const groupOf = (r: Rank) => RANK_GROUPS.find(g => g.ranks.includes(r))?.id ?? 'P';
  const list = pool
    .filter(m => m.name.toLowerCase().includes(q.trim().toLowerCase()) && (rankGroups.length === 0 || rankGroups.includes(groupOf(m.rank))))
    .sort((a, b) => (a.gamesPlayed !== b.gamesPlayed ? a.gamesPlayed - b.gamesPlayed : a.checkInTime - b.checkInTime));
  useEffect(() => { setHi(0); }, [q, rankGroups]);

  const toggle = (id: string) => {
    if (single) { onConfirm([id]); return; }
    setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= max ? prev : [...prev, id]);
  };
  const confirm = () => { if (picked.length > 0) onConfirm(picked); };
  const full = !single && picked.length >= max;
  // คนที่ติ๊กจะถูกใส่ช่องว่างตามลำดับ → คำนวณทีมสุดท้ายล่วงหน้า
  const empties = (slots ?? []).map((p, i) => (p === null ? i : -1)).filter(i => i >= 0);
  const finalSlots: (string | null)[] = slots ? [...slots] : [];
  if (!single) picked.forEach((id, k) => { if (empties[k] !== undefined) finalSlots[empties[k]] = id; });
  const nameOf = (id: string | null) => (id ? members.find(m => m.id === id)?.name ?? '' : '');
  const teamOfPicked = (idx: number): 'A' | 'B' | null => (slots && empties[idx] !== undefined ? (empties[idx] < 2 ? 'A' : 'B') : null);

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-4" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div className="absolute inset-0 bg-on-surface/55 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.14 }}
        className="relative z-10 bg-white rounded-[1.75rem] shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] sm:h-[min(46rem,92vh)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-on-surface/5 shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="font-headline font-black text-lg leading-tight">{single ? 'เลือกผู้เล่น' : `เลือกผู้เล่นลงคอร์ด`}</h3>
            <p className="text-xs font-bold text-on-surface/45">{single ? 'แตะชื่อเพื่อเลือก' : `แตะเลือกได้สูงสุด ${max} คน · เลือกแล้ว ${picked.length}/${max}`} · เรียงจากตีน้อย → มาก</p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-background" aria-label="ปิด"><X size={20} /></button>
        </div>
        {!single && slots && (
          <div className="px-4 pt-3 shrink-0 grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
            {([['A', [0, 1], 'bg-blue-50 border-blue-200 text-blue-700'], ['B', [2, 3], 'bg-orange-50 border-orange-200 text-orange-600']] as const).map(([t, idxs, cls], ti) => (
              <React.Fragment key={t}>
                {ti === 1 && <span className="self-center text-[11px] font-black text-on-surface/30">VS</span>}
                <div className={cn('rounded-xl border px-2.5 py-1.5', cls)}>
                  <p className="text-[11px] font-black leading-none mb-1">ทีม {t}</p>
                  {idxs.map(i => {
                    const id = finalSlots[i];
                    const isNew = !!id && picked.includes(id);
                    return <p key={i} className={cn('text-sm font-bold leading-snug truncate', !id && 'text-on-surface/25 font-semibold', isNew && 'underline decoration-2 underline-offset-2')}>{id ? nameOf(id) : 'ว่าง'}</p>;
                  })}
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
        <div className="px-4 pt-3 shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/30" />
            <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อ (ไม่บังคับ)"
              onKeyDown={e => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(i + 1, list.length - 1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setHi(i => Math.max(i - 1, 0)); return; }
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (q.trim() && list[hi]) { toggle(list[hi].id); setQ(''); return; }
                if (!single) confirm();
              }}
              className="w-full pl-9 pr-3 py-2.5 bg-background rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-2.5 pb-0.5" role="group" aria-label="กรองระดับมือ">
            <button onClick={() => setRankGroups([])}
              className={cn('shrink-0 px-3 py-1.5 rounded-full text-xs font-black border transition-colors', rankGroups.length === 0 ? 'bg-primary text-white border-primary' : 'bg-white text-on-surface/60 border-on-surface/10 hover:border-primary/40')}>
              ทั้งหมด {pool.length}
            </button>
            {RANK_GROUPS.map(g => {
              const n = pool.filter(m => g.ranks.includes(m.rank)).length;
              const on = rankGroups.includes(g.id);
              return (
                <button key={g.id} disabled={n === 0 && !on} onClick={() => setRankGroups(prev => on ? prev.filter(x => x !== g.id) : [...prev, g.id])} aria-pressed={on}
                  className={cn('shrink-0 px-3 py-1.5 rounded-full text-xs font-black border transition-colors disabled:opacity-35', on ? 'bg-primary text-white border-primary' : 'bg-white text-on-surface/60 border-on-surface/10 hover:border-primary/40')}>
                  {g.label} <span className="opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto mt-2 pb-1">
          {currentPlayerId && onRemove && (
            <button onClick={() => { onRemove(); onClose(); }} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-error/5 text-error">
              <X size={15} /><span className="text-sm font-black">นำออกจากช่องนี้</span>
            </button>
          )}
          {list.length === 0 && <p className="text-center py-8 text-sm text-on-surface/30 font-bold">{pool.length === 0 ? 'ไม่มีผู้เล่นที่รอลงสนาม' : 'ไม่พบผู้เล่นตามตัวกรอง'}</p>}
          {list.map((m, i) => {
            const idx = picked.indexOf(m.id);
            const on = idx >= 0;
            const locked = !on && full;
            return (
              <button key={m.id} onClick={() => toggle(m.id)} disabled={locked}
                className={cn('w-full flex items-center gap-3 px-5 py-2.5 transition-colors text-left', on ? 'bg-primary/10' : 'hover:bg-primary/5', locked && 'opacity-35', i === hi && q.trim() && 'ring-2 ring-inset ring-primary/20')}>
                <PlayerBadge rank={m.rank} name={m.name} profile={profiles[m.id]} className="w-10 h-10 rounded-xl text-sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{m.name}{m.id === currentPlayerId && <span className="ml-2 text-xs text-primary font-black">อยู่ช่องนี้</span>}</p>
                  <p className="text-xs text-on-surface/40">{RANK_LEVEL_LABELS[m.rank]}{RANK_LEVEL_LABELS[m.rank] ? ' · ' : ''}ระดับ {m.rank}</p>
                </div>
                <span className="shrink-0 text-right leading-none" title="จำนวนเกมที่ตีวันนี้">
                  <span className={cn('block font-headline font-black text-xl', m.gamesPlayed === 0 ? 'text-emerald-600' : 'text-on-surface/70')}>{m.gamesPlayed}</span>
                  <span className="block text-[10px] font-bold text-on-surface/40 mt-0.5">เกม</span>
                </span>
                {!single && (
                  <span className={cn('h-7 min-w-7 px-1.5 rounded-full flex items-center justify-center text-xs font-black shrink-0 border-2',
                    !on ? 'border-on-surface/15 text-transparent w-7' : teamOfPicked(idx) === 'B' ? 'bg-orange-500 border-orange-500 text-white' : teamOfPicked(idx) === 'A' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-primary border-primary text-white')}>
                    {on ? (teamOfPicked(idx) ? `ทีม ${teamOfPicked(idx)}` : idx + 1) : '·'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {!single && (
          <div className="px-4 py-3 border-t border-on-surface/5 flex items-center gap-2 shrink-0">
            <button onClick={() => setPicked([])} disabled={picked.length === 0} className="px-4 py-3 rounded-xl text-sm font-bold text-on-surface/50 hover:bg-background disabled:opacity-30">ล้าง</button>
            <button onClick={confirm} disabled={picked.length === 0}
              className="flex-1 py-3 rounded-xl bg-primary text-white font-black text-sm shadow-lg shadow-primary/20 disabled:opacity-40 active:scale-95 transition-all">
              ลงคอร์ด {picked.length > 0 ? `${picked.length} คน` : ''}
            </button>
          </div>
        )}
      </motion.div>
    </div>,
    document.body
  );
}

// ── Slot Card ────────────────────────────────────────────────────────────────
export function SlotCard({ slotIndex, courtId, playerId, team, members, onSelect, locked, openRequest, profiles = {}, pickAll = false, sheet = false, multi }: {
  key?: number;
  /** เลือกหลายคนในหน้าต่างกลางจอ (หน้าจัดคอร์ด): emptySlots = ช่องว่างที่เหลือ · onPickMany = ใส่ชื่อทั้งหมดลงช่องว่างตามลำดับ */
  multi?: { emptySlots: number; slots?: (string | null)[]; onPickMany: (ids: string[]) => void };
  pickAll?: boolean;
  sheet?: boolean;
  profiles?: Record<string, PlayerProfile>;
  slotIndex: number;
  courtId: string;
  playerId: string | null;
  team: 'A' | 'B';
  members: Member[];
  onSelect: (id: string | null) => void;
  locked: boolean;
  /** Bumps (any changed value) to force this slot's picker open — used by the "1-4" keyboard shortcut. */
  openRequest?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const player = members.find(m => m.id === playerId) ?? null;

  useEffect(() => {
    if (!locked && openRequest != null) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (multi) return; // หน้าต่างกลางจอปิดด้วยปุ่ม/พื้นหลังของมันเอง
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  const isA = team === 'A';

  return (
    <div ref={wrapRef} className="relative">
      <div
        draggable={!locked && !!player}
        onDragStart={e => {
          if (locked || !player) return;
          draggingPlayerId = player.id;
          e.dataTransfer.setData('playerId', player.id);
          e.dataTransfer.setData('sourceCourtId', courtId);
          e.dataTransfer.setData('sourceSlotIndex', slotIndex.toString());
        }}
        onClick={() => { if (!locked) setOpen(v => !v); }}
        onDragOver={e => { if (locked) return; e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          if (locked) return;
          e.preventDefault(); setDragOver(false);
          const pid = draggingPlayerId ?? e.dataTransfer.getData('playerId');
          if (pid) onSelect(pid);
        }}
        className={cn(
          'relative rounded-2xl transition-all select-none group flex items-center min-h-[72px]',
          locked ? 'cursor-default' : 'cursor-pointer',
          dragOver
            ? 'border-2 border-yellow-300 bg-yellow-50 scale-[1.02] shadow-xl'
            : player
              ? cn('bg-white shadow-sm border border-on-surface/10 border-l-[5px]', isA ? 'border-l-blue-500' : 'border-l-orange-500')
              : 'border-2 border-dashed border-slate-300 bg-white/70 hover:bg-white hover:border-primary/50 justify-center'
        )}
      >
        {/* Slot number badge — matches the "1-4" keyboard shortcut */}
        {!locked && (
          <div className="absolute -top-2 -left-2 w-6 h-6 bg-on-surface/70 text-white rounded-full flex items-center justify-center z-20 shadow border-2 border-white text-[11px] font-black">
            {slotIndex + 1}
          </div>
        )}
        {!locked && player && (
          <button
            onClick={e => { e.stopPropagation(); onSelect(null); }}
            title="นำออกจากสล็อต"
            className="absolute -top-2 -right-2 w-6 h-6 bg-red-100 text-red-500 border border-red-300 rounded-full flex items-center justify-center z-20 shadow-sm transition-transform hover:scale-110 active:scale-95"
          >
            <X size={13} strokeWidth={3} />
          </button>
        )}
        {player ? (
          <div className="w-full p-2.5 sm:p-3 flex items-center gap-2.5 sm:gap-3">
            {profiles[player.id]?.avatar
              ? <img src={profiles[player.id].avatar} alt={player.name} draggable={false} className={cn('w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover shrink-0 ring-[3px]', isA ? 'ring-blue-500' : 'ring-orange-500')} />
              : <div className={cn('w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-black text-sm sm:text-base text-white shrink-0', isA ? 'bg-blue-500' : 'bg-orange-500')}>
                {initials(player.name)}
              </div>}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-headline font-black text-sm sm:text-base truncate max-w-full">{player.name}</p>
                <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-black border', rankPill(player.rank))}>{player.rank}</span>
              </div>
              <span className={cn('inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-black', isA ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-600')}>ทีม {team}</span>
            </div>
            {!locked && (
              <span className={cn('hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-sm font-black shrink-0 bg-white', isA ? 'border-blue-300 text-blue-700' : 'border-blue-300 text-blue-700')}>
                <RefreshCw size={15} /> เปลี่ยน
              </span>
            )}
            {locked && <Lock size={14} className="text-on-surface/30 shrink-0" />}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3 py-4 px-3 text-on-surface/70">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
              <Plus size={20} className="text-slate-600" />
            </div>
            <span className="font-headline font-black text-sm sm:text-base">เลือกผู้เล่น</span>
          </div>
        )}
        {open && !locked && <div className="absolute inset-0 ring-2 ring-primary/40 rounded-2xl pointer-events-none" />}
      </div>

      <AnimatePresence>
        {open && !locked && multi && (
          <PlayerModalPicker
            members={members}
            profiles={profiles}
            currentPlayerId={playerId}
            pickAll={pickAll}
            max={player ? 1 : Math.max(1, multi.emptySlots)}
            slots={multi.slots}
            onConfirm={ids => { if (player) onSelect(ids[0]); else multi.onPickMany(ids); setOpen(false); }}
            onRemove={() => onSelect(null)}
            onClose={() => setOpen(false)}
          />
        )}
        {open && !locked && !multi && (
          <PlayerPicker
            profiles={profiles}
            pickAll={pickAll}
            sheet={sheet}
            members={members}
            currentPlayerId={playerId}
            onSelect={onSelect}
            onClose={() => setOpen(false)}
            position={team === 'A' ? 'top' : 'bottom'}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Queue Slot Editor Modal ───────────────────────────────────────────────────
function QueueSlotEditor({ members, slot, onSave, onClose, profiles = {}, queuedElsewhere }: {
  profiles?: Record<string, PlayerProfile>;
  /** คนที่อยู่ในคิวอื่นอยู่แล้ว — จัดอัตโนมัติจะเลี่ยง */
  queuedElsewhere?: Set<string>;
  members: Member[];
  slot?: Partial<CourtQueueSlot>;
  onSave: (slot: CourtQueueSlot) => void;
  onClose: () => void;
}) {
  // 4 ช่องแบบเดียวกับหน้าจัดคอร์ด: ช่อง 1-2 = ทีม A, ช่อง 3-4 = ทีม B
  const [slots, setSlots] = useState<(string | null)[]>([
    slot?.teamA?.[0]?.memberId ?? null, slot?.teamA?.[1]?.memberId ?? null,
    slot?.teamB?.[0]?.memberId ?? null, slot?.teamB?.[1]?.memberId ?? null,
  ]);
  const [note, setNote] = useState(slot?.note ?? '');

  // เลือกคนที่อยู่อีกช่องแล้ว = สลับตำแหน่งกัน (ไม่ให้ซ้ำ)
  const setSlotAt = (idx: number, id: string | null) => setSlots(prev => {
    const next = [...prev];
    const from = id ? next.indexOf(id) : -1;
    if (from >= 0 && from !== idx) next[from] = next[idx];
    next[idx] = id;
    return next;
  });
  // เลือกหลายคนทีเดียว: ใส่ลงช่องว่างตามลำดับ (เหมือนหน้าจัดคอร์ด)
  const pickMany = (ids: string[]) => setSlots(prev => {
    const next = [...prev];
    const empties = next.map((p, i) => (p === null ? i : -1)).filter(i => i >= 0);
    ids.slice(0, empties.length).forEach((id, k) => { next[empties[k]] = id; });
    return next;
  });
  // จัดอัตโนมัติ: เอาคนที่เล่นน้อยสุดก่อน (เท่ากัน = มารอนานกว่า) ที่ยังไม่อยู่ในคิวนี้/คิวอื่น · ถ้าว่างครบ 4 ช่อง จัดทีมให้สมดุลตามระดับมือ
  const autoFill = () => {
    const used = new Set(slots.filter(Boolean) as string[]);
    const cand = members
      .filter(m => m.status === 'waiting' && !used.has(m.id) && !queuedElsewhere?.has(m.id))
      .sort((a, b) => (a.gamesPlayed !== b.gamesPlayed ? a.gamesPlayed - b.gamesPlayed : a.checkInTime - b.checkInTime));
    const empties = slots.map((p, i) => (p === null ? i : -1)).filter(i => i >= 0);
    if (empties.length === 0) return;
    if (cand.length < empties.length) alert(`มีคนรอที่ยังไม่อยู่ในคิวเหลือแค่ ${cand.length} คน`);
    const take = cand.slice(0, empties.length);
    if (take.length === 0) return;
    if (empties.length === 4 && take.length === 4) {
      // แข็ง+อ่อน คู่กับ กลาง+กลาง เพื่อให้สองทีมสมดุล
      const byRank = [...take].sort((a, b) => (RANK_WEIGHTS[b.rank] || 0) - (RANK_WEIGHTS[a.rank] || 0));
      setSlots([byRank[0].id, byRank[3].id, byRank[1].id, byRank[2].id]);
      return;
    }
    setSlots(prev => { const next = [...prev]; take.forEach((m, k) => { next[empties[k]] = m.id; }); return next; });
  };
  const emptyCount = slots.filter(p => p === null).length;
  const multiPick = { emptySlots: emptyCount, slots, onPickMany: pickMany };

  const toPlayer = (id: string | null): QueuePlayer | null => {
    const m = id ? members.find(x => x.id === id) : null;
    return m ? { memberId: m.id, name: m.name, rank: m.rank } : null;
  };

  const handleSave = () => {
    const ta = [slots[0], slots[1]].map(toPlayer).filter(Boolean) as QueuePlayer[];
    const tb = [slots[2], slots[3]].map(toPlayer).filter(Boolean) as QueuePlayer[];
    if (ta.length === 0 && tb.length === 0) { alert('กรุณาเลือกผู้เล่นอย่างน้อย 1 คน'); return; }
    onSave({
      id: slot?.id ?? Math.random().toString(36).substr(2, 9),
      teamA: ta,
      teamB: tb,
      note: note.trim() || undefined,
    });
  };

  useModalHotkeys({ onClose, onSubmit: handleSave });

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-on-surface/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-[2rem] p-5 sm:p-6 w-full max-w-xl shadow-2xl z-10">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="font-headline font-black text-xl">{slot?.id ? 'แก้ไขคิว' : 'เพิ่มคิวใหม่'}</h3>
          <button onClick={autoFill} disabled={emptyCount === 0} title="เติมช่องว่างด้วยคนที่รอนาน/เล่นน้อยสุด"
            className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 border-blue-400 text-blue-700 bg-white hover:bg-blue-50 font-black text-sm disabled:opacity-35 whitespace-nowrap">
            <Wand2 size={15} /> จัดอัตโนมัติ
          </button>
          <button onClick={onClose} className="p-2 hover:bg-background rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <p className="text-xs font-bold text-on-surface/45 mb-3">แตะช่อง <span className="text-primary">เลือกผู้เล่น</span> เพื่อเลือกหลายคนทีเดียว (เรียงเกมน้อย → มาก) หรือกด <span className="text-blue-700">จัดอัตโนมัติ</span> ให้ระบบเลือกคนรอนาน/เล่นน้อยสุดให้</p>

        <div className="space-y-3 mb-5 max-h-[60vh] overflow-y-auto pr-1 pt-2">
          {(['A', 'B'] as const).map(t => {
            const idxs = t === 'A' ? [0, 1] : [2, 3];
            const isA = t === 'A';
            return (
              <React.Fragment key={t}>
                {!isA && <div className="text-center text-on-surface/30 font-black text-sm">VS</div>}
                <div className={cn('rounded-2xl p-3 space-y-2.5 border', isA ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100')}>
                  <div className="flex items-center justify-between">
                    <h4 className={cn('flex items-center gap-2 font-headline font-black', isA ? 'text-blue-700' : 'text-orange-600')}>
                      <span className={cn('w-7 h-7 rounded-full text-white flex items-center justify-center text-xs', isA ? 'bg-blue-600' : 'bg-orange-500')}>{t}</span> Team {t}
                    </h4>
                    <span className={cn('text-xs font-black', isA ? 'text-blue-700' : 'text-orange-600')}>{idxs.filter(i => slots[i]).length}/2 คน</span>
                  </div>
                  {idxs.map(i => (
                    <SlotCard key={i} slotIndex={i} courtId="queue" playerId={slots[i]} team={t} members={members} profiles={profiles}
                      onSelect={id => setSlotAt(i, id)} locked={false} pickAll multi={multiPick} />
                  ))}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="หมายเหตุ (ไม่บังคับ)"
          className="w-full px-4 py-2.5 bg-background rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 mb-4 border-none"
        />

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-sm text-on-surface/50 bg-background hover:bg-on-surface/5 transition-all">
            ยกเลิก
          </button>
          <button onClick={handleSave} className="flex-1 bg-primary text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all">
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Game History Row (editable) ──────────────────────────────────────────────
function GameRow({ game, onEditGame, onUndoGame, shuttlePrice }: {
  key?: string;
  game: GameRecord;
  onEditGame: (id: string, n: number) => void;
  onUndoGame: (id: string) => void;
  shuttlePrice: number;
}) {
  const teamA = game.players.slice(0, 2);
  const teamB = game.players.slice(2, 4);
  return (
    <div className="bg-background border border-on-surface/5 rounded-2xl p-3 sm:p-4 flex items-center gap-4 flex-wrap">
      {/* Time */}
      <div className="shrink-0 text-center">
        <p className="text-on-surface/40 text-xs font-semibold">เกม</p>
        <p className="text-on-surface font-bold text-sm">{format(game.playedAt, 'HH:mm')}</p>
      </div>

      {/* Players */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {teamA.map(p => (
            <div key={p.id} className={cn('flex items-center gap-1 px-2 py-1 rounded-lg', RANK_COLORS[p.rank])}>
              <span className="text-xs font-bold">{p.rank}</span>
              <span className="text-xs font-bold">{p.name}</span>
            </div>
          ))}
          <span className="text-on-surface/30 text-xs font-black">VS</span>
          {teamB.map(p => (
            <div key={p.id} className={cn('flex items-center gap-1 px-2 py-1 rounded-lg', RANK_COLORS[p.rank])}>
              <span className="text-xs font-bold">{p.rank}</span>
              <span className="text-xs font-bold">{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Shuttle edit */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-on-surface/40 text-xs font-black">🏸</span>
        <button
          onClick={() => onEditGame(game.id, game.shuttlesUsed - 1)}
          disabled={game.shuttlesUsed <= 1}
          className="w-7 h-7 bg-white hover:bg-primary/10 disabled:opacity-20 text-on-surface shadow-sm rounded-lg font-black flex items-center justify-center transition-colors"
        >−</button>
        <span className="text-on-surface font-black text-base w-6 text-center">{game.shuttlesUsed}</span>
        <button
          onClick={() => onEditGame(game.id, game.shuttlesUsed + 1)}
          className="w-7 h-7 bg-white hover:bg-primary/10 text-on-surface shadow-sm rounded-lg font-black flex items-center justify-center transition-colors"
        >+</button>
      </div>

      {/* Cost */}
      <div className="text-right shrink-0">
        <p className="text-on-surface/45 text-xs font-semibold">ค่าลูก/คน</p>
        <p className="text-on-surface font-headline font-bold text-base">฿{game.shuttleCostPerPerson.toFixed(0)}</p>
      </div>

      {/* Undo Button */}
      <button
        onClick={() => onUndoGame(game.id)}
        className="p-2 text-on-surface/25 hover:text-red-500 hover:bg-red-400/10 rounded-xl transition-all"
        title="ยกเลิกผลการตี (คืนเงินทุกคน)"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function CourtsTab({
  members, courts, snacks, searchQuery, gameHistory,
  onAutoMatch, onStartGame, onResetCourt, onRemovePlayer, onAddPlayer,
  onDeleteCourt, onAddSnack, productsOn = true, onEditGame, onUndoGame, onUpdateCourt,
  minRankFilter, setMinRankFilter, maxRankFilter, setMaxRankFilter,
  onAddCourt,
  courtQueues, onAddCourtQueue, onRemoveCourtQueue, onUpdateCourtQueue, onMoveCourtQueue, onUseQueueSlot,
  sessionMode, askScore, shuttleChargePerShuttle, focusCourtId, profiles = {},
}: Props) {
  const [scoringCourtId, setScoringCourtId] = useState<string | null>(null);
  const finishCourt = (courtId: string) => {
    if (askScore) setScoringCourtId(courtId);
    else onResetCourt(courtId);
  };
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(() => (focusCourtId && courts.some(c => c.id === focusCourtId) ? focusCourtId : courts[0]?.id ?? null));
  // มือถือ: เลือกคอร์ทด้วย dropdown
  const [courtMenuOpen, setCourtMenuOpen] = useState(false);
  const courtMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!courtMenuOpen) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (courtMenuRef.current && !courtMenuRef.current.contains(e.target as Node)) setCourtMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, [courtMenuOpen]);
  const courtLook = (c: Court) => {
    const filled = c.players.filter(Boolean).length;
    const active = c.status === 'active';
    const tone: 'green' | 'orange' | 'gray' = active ? 'orange' : filled > 0 ? 'green' : 'gray';
    const label = active ? `กำลังเล่น${c.startTime ? ' · ' + format(c.startTime, 'HH:mm') : ''}` : filled > 0 ? `กำลังจัดทีม · ${filled}/4` : 'ว่าง';
    const box = tone === 'green' ? 'bg-emerald-50 border-emerald-300' : tone === 'orange' ? 'bg-orange-50 border-orange-300' : 'bg-slate-50 border-slate-200';
    const text = tone === 'orange' ? 'text-orange-600' : tone === 'green' ? 'text-emerald-700' : 'text-on-surface/45';
    return { tone, label, box, text };
  };
  useEffect(() => {
    if (focusCourtId && courts.some(c => c.id === focusCourtId)) setSelectedCourtId(focusCourtId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCourtId]);
  const [posTarget, setPosTarget] = useState<Member | null>(null);
  const [localSearch, setLocalSearch] = useState('');
  const [sortBy, setSortBy] = useState<'queue' | 'wait' | 'games'>('queue');
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const [editingSlot, setEditingSlot] = useState<{ courtId: string; slot?: CourtQueueSlot } | null>(null);

  const rankOptions = [...RANKS].reverse(); // from lower to higher P+ to VIP1

  useEffect(() => {
    if (!courts.find(c => c.id === selectedCourtId)) setSelectedCourtId(courts[0]?.id ?? null);
  }, [courts, selectedCourtId]);

  const selected = courts.find(c => c.id === selectedCourtId) ?? null;
  const isActive = selected?.status === 'active';
  const filledCount = selected ? selected.players.filter(Boolean).length : 0;

  // Games for this court only
  const courtGames = selected
    ? gameHistory.filter(g => g.courtId === selected.id).slice(0, 10)
    : [];

  const shuttlePrice = 25; // reflect same default; ideally from props

  const waiting = members
    .filter(m => m.status === 'waiting')
    .filter(m => {
      const query = localSearch.toLowerCase().trim();
      if (!query) return true;
      return m.name.toLowerCase().includes(query);
    })
    .filter(m => {
      const minW = RANK_WEIGHTS[minRankFilter] || 0;
      const maxW = RANK_WEIGHTS[maxRankFilter] || 15;
      const lower = Math.min(minW, maxW);
      const upper = Math.max(minW, maxW);
      const w = RANK_WEIGHTS[m.rank] || 0;
      return w >= lower && w <= upper;
    })
    .sort((a, b) => sortBy === 'wait' ? a.checkInTime - b.checkInTime
      : sortBy === 'games' ? (a.gamesPlayed - b.gamesPlayed) || (a.checkInTime - b.checkInTime)
        : a.gamesPlayed !== b.gamesPlayed ? a.gamesPlayed - b.gamesPlayed : a.checkInTime - b.checkInTime);

  // คอร์ทที่ยังไม่มีใครถูกจัดลง แต่มีคิวรออยู่ → ก่อนจัดคนลงคอร์ท ถามก่อนว่าจะใช้คิว/ลบคิว/จัดเองต่อ (ถามครั้งเดียวต่อรอบการจัด)
  const [queueAsk, setQueueAsk] = useState<{ courtId: string; proceed: () => void } | null>(null);
  const askedRef = useRef<Set<string>>(new Set());
  useEffect(() => { courts.forEach(c => { if (c.status === 'active') askedRef.current.delete(c.id); }); }, [courts]);
  const guardQueue = (proceed: () => void) => {
    if (!selected || selected.status === 'active') { proceed(); return; }
    // มีคิวอยู่ที่คอร์ทไหนก็ได้ (ไม่ต้องเป็นคิวของคอร์ทนี้) ก็ถาม
    const anyQueue = Object.values(courtQueues).some(q => q && q.length > 0);
    const emptyCourt = selected.players.every(p => !p);
    if (!anyQueue || !emptyCourt || askedRef.current.has(selected.id)) { proceed(); return; }
    setQueueAsk({ courtId: selected.id, proceed });
  };
  // ปุ่ม "เอาคิวลงคอร์ท": มีคิวเดียว → ย้ายลงเลย · หลายคิว → เปิดหน้าต่างให้เลือก (คิวของคอร์ทนี้ขึ้นก่อน)
  const allQueueSlots = courts
    .flatMap(c => (courtQueues[c.id] || []).map(slot => ({ courtId: c.id, slot })))
    .sort((a, b) => (a.courtId === selected?.id ? 0 : 1) - (b.courtId === selected?.id ? 0 : 1));
  const pullFromQueue = () => {
    if (!selected || selected.status === 'active' || allQueueSlots.length === 0) return;
    if (allQueueSlots.length > 1) { setQueueAsk({ courtId: selected.id, proceed: () => {} }); return; }
    const only = allQueueSlots[0];
    if (selected.players.some(Boolean) && !confirm('คนที่จัดไว้ในคอร์ทนี้จะกลับไปรอคิว แล้วใช้ผู้เล่นจากคิวแทน ตกลงไหม?')) return;
    onUseQueueSlot(selected.id, only.slot, only.courtId);
  };

  // ลบคิวจนหมดทุกคอร์ทระหว่างที่ถามอยู่ → จัดคนต่อได้เลย
  useEffect(() => {
    if (queueAsk && !Object.values(courtQueues).some(q => q && q.length > 0)) { const go = queueAsk.proceed; setQueueAsk(null); go(); }
  }, [courtQueues, queueAsk]);

  const handleSelect = (slot: number, pid: string | null) => {
    if (!selected) return;
    if (pid === null) onRemovePlayer(selected.id, slot);
    else guardQueue(() => onAddPlayer(selected.id, slot, pid));
  };

  const handleDoubleClick = (m: Member) => {
    if (!selected) return;
    const empty = selected.players.findIndex(p => p === null);
    if (empty !== -1) guardQueue(() => onAddPlayer(selected.id, empty, m.id));
    else alert('ไม่มีสล็อตว่างในคอร์ดนี้');
  };

  // เลือกหลายคนทีเดียว: ใส่ชื่อลงช่องว่างของคอร์ดตามลำดับ (ผ่านการถามคิวค้างเหมือนเดิม)
  const multiPick = selected ? {
    emptySlots: selected.players.slice(0, 4).filter(p => p === null).length,
    slots: selected.players.slice(0, 4),
    onPickMany: (ids: string[]) => guardQueue(() => {
      const empties = selected.players.slice(0, 4).map((p, i) => (p === null ? i : -1)).filter(i => i >= 0);
      ids.slice(0, empties.length).forEach((id, k) => onAddPlayer(selected.id, empties[k], id));
    }),
  } : undefined;

  // สลับทีม = สุ่มจัดคู่ใหม่ (ไม่ใช่แค่ย้าย A↔B) — ได้คู่ที่ต่างจากเดิมเสมอเมื่อมีผู้เล่นครบ 4 คน
  const swapTeams = () => {
    if (!selected || isActive) return;
    const cur = selected.players.slice(0, 4);
    const ids = cur.filter((x): x is string => !!x);
    if (ids.length < 2) return;
    const shuffle = <T,>(arr: T[]) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    // คู่ที่อยู่ทีมเดียวกัน (ไม่สนลำดับ/ฝั่ง) ใช้เทียบว่าจัดใหม่แล้วต่างจากเดิมจริง
    const key = (p: (string | null)[]) => [[p[0], p[1]].sort().join('+'), [p[2], p[3]].sort().join('+')].sort().join('|');
    const before = key(cur);
    let next = cur;
    for (let i = 0; i < 30; i++) {
      const cand = shuffle(cur);
      if (ids.length === 4 ? key(cand) !== before : cand.join() !== cur.join()) { next = cand; break; }
    }
    onUpdateCourt(prev => prev.map(c => c.id === selected.id ? { ...c, players: next } : c));
  };

  const addShuttle = (delta: number) => {
    if (!selected) return;
    onUpdateCourt(prev => prev.map(c => c.id === selected.id
      ? { ...c, shuttlecocks: Math.max(0, c.shuttlecocks + delta) } : c));
  };

  const teamA = selected ? [0, 1].map(i => members.find(m => m.id === selected.players[i]) ?? null) : [];
  const teamB = selected ? [2, 3].map(i => members.find(m => m.id === selected.players[i]) ?? null) : [];

  // ป็อปอัพ "เริ่มเกมเลยไหม?" — ขึ้นเมื่อเติมคนสุดท้ายจนคอร์ทครบ 4 คน (หรือกดจัดอัตโนมัติจนครบ)
  // ไม่ขึ้นตอนโหลดข้อมูลเข้ามาทีเดียวครบ 4 คน (เช็กว่าก่อนหน้านี้เหลือ 3 หรือกดจัดอัตโนมัติ)
  const [startPromptId, setStartPromptId] = useState<string | null>(null);
  const prevFilledRef = useRef<Record<string, number> | null>(null);
  const expectPromptRef = useRef(false);
  useEffect(() => {
    const counts: Record<string, number> = {};
    courts.forEach(c => { counts[c.id] = c.players.filter(Boolean).length; });
    const prev = prevFilledRef.current;
    if (prev) {
      const justFull = courts.find(c => c.status !== 'active' && counts[c.id] === 4 && (prev[c.id] ?? 0) < 4
        && ((prev[c.id] ?? 0) === 3 || expectPromptRef.current));
      if (justFull) { setStartPromptId(justFull.id); expectPromptRef.current = false; }
    }
    prevFilledRef.current = counts;
  }, [courts]);
  const promptCourt = courts.find(c => c.id === startPromptId && c.status !== 'active' && c.players.filter(Boolean).length === 4) ?? null;
  const startFromPrompt = () => {
    if (!promptCourt) return;
    const id = promptCourt.id;
    setStartPromptId(null);
    onStartGame(id);
  };
  useEffect(() => {
    if (!promptCourt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setStartPromptId(null); }
      else if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); e.stopPropagation(); startFromPrompt(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptCourt?.id]);

  // Keyboard shortcuts: ←/→ switch court tabs, 1-4 open that slot's player picker, Enter starts
  // the game once 4/4 are filled, and (while a game is active) pressing Enter twice quickly ends it.
  const [openSlotRequest, setOpenSlotRequest] = useState<{ slot: number; nonce: number } | null>(null);
  const [endGamePending, setEndGamePending] = useState(false);
  const lastEnterRef = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selected || posTarget || editingSlot || scoringCourtId || startPromptId) return;
      const active = document.activeElement as HTMLElement | null;
      const isTyping = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
      if (isTyping) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const idx = courts.findIndex(c => c.id === selected.id);
        if (idx === -1) return;
        const nextIdx = e.key === 'ArrowRight' ? (idx + 1) % courts.length : (idx - 1 + courts.length) % courts.length;
        setSelectedCourtId(courts[nextIdx].id);
        return;
      }

      if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        setOpenSlotRequest({ slot: Number(e.key) - 1, nonce: Date.now() });
        return;
      }

      if (e.key !== 'Enter' || e.repeat) return;
      // e.repeat กัน auto-repeat จากการกด Enter ค้าง — ไม่งั้นแค่ค้าง Enter ครั้งเดียวก็ทำให้
      // เข้าเงื่อนไข "กดติดกัน 2 ครั้ง" ของปุ่มจบเกมด้านล่างได้โดยไม่ตั้งใจ
      e.preventDefault();

      if (isActive) {
        // Require a quick double-tap of Enter to end the game (avoid accidental taps)
        const now = Date.now();
        if (now - lastEnterRef.current < 600) {
          lastEnterRef.current = 0;
          setEndGamePending(false);
          finishCourt(selected.id);
        } else {
          lastEnterRef.current = now;
          setEndGamePending(true);
          setTimeout(() => setEndGamePending(false), 600);
        }
      } else if (filledCount === 4) {
        onStartGame(selected.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected, isActive, filledCount, posTarget, editingSlot, scoringCourtId, startPromptId, askScore, onResetCourt, onStartGame, courts]);

  return (
    <div className="space-y-4 xl:space-y-0 xl:flex xl:flex-col xl:gap-4 xl:h-[calc(100vh-3rem)]">
      {/* ผลการแข่งขัน: ทีมไหนชนะ หรือเสมอ — เก็บเป็น 1-0 / 0-1 / 0-0 (ไม่เก็บคะแนนจริง) */}
      {scoringCourtId && (() => {
        const sc = courts.find(c => c.id === scoringCourtId);
        const nm = (i: number) => members.find(m => m.id === sc?.players[i])?.name ?? '—';
        const done = (score?: { scoreA: number; scoreB: number }) => { onResetCourt(scoringCourtId, score); setScoringCourtId(null); };
        return (
          <div className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4" onClick={() => setScoringCourtId(null)}>
            <div className="bg-white rounded-[2rem] p-6 w-full max-w-md space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="text-center space-y-1">
                <p className="text-sm font-black text-primary">{sc?.name}</p>
                <h3 className="font-headline font-black text-2xl">ใครชนะ?</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => done({ scoreA: 1, scoreB: 0 })}
                  className="rounded-2xl bg-blue-50 border-2 border-blue-200 hover:border-blue-500 hover:bg-blue-100 active:scale-[0.98] transition-all p-4 text-center space-y-1">
                  <p className="text-xs font-black text-blue-600">ทีม A ชนะ 🏆</p>
                  <p className="font-bold text-sm truncate">{nm(0)}</p>
                  <p className="font-bold text-sm truncate">{nm(1)}</p>
                </button>
                <button onClick={() => done({ scoreA: 0, scoreB: 1 })}
                  className="rounded-2xl bg-orange-50 border-2 border-orange-200 hover:border-orange-500 hover:bg-orange-100 active:scale-[0.98] transition-all p-4 text-center space-y-1">
                  <p className="text-xs font-black text-orange-600">ทีม B ชนะ 🏆</p>
                  <p className="font-bold text-sm truncate">{nm(2)}</p>
                  <p className="font-bold text-sm truncate">{nm(3)}</p>
                </button>
              </div>
              <button onClick={() => done({ scoreA: 0, scoreB: 0 })}
                className="w-full py-3.5 rounded-2xl bg-slate-50 border-2 border-slate-200 hover:border-slate-400 font-black text-sm text-slate-700 active:scale-[0.99] transition-all">🤝 เสมอ</button>
              <button onClick={() => done()} className="w-full py-2.5 rounded-xl text-xs font-bold text-on-surface/45 hover:bg-background">ข้าม (ไม่บันทึกผล) และจบเกม</button>
            </div>
          </div>
        );
      })()}
      {/* Start-game prompt */}
      {promptCourt && (() => {
        const nm = (i: number) => members.find(m => m.id === promptCourt.players[i])?.name ?? '—';
        return (
          <div className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4" onClick={() => setStartPromptId(null)}>
            <div className="bg-white rounded-[2rem] p-6 w-full max-w-md space-y-5 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="text-center space-y-1">
                <p className="text-sm font-black text-emerald-600">{promptCourt.name} · ผู้เล่นครบ 4 คนแล้ว</p>
                <h3 className="font-headline font-black text-2xl">เริ่มเกมเลยไหม?</h3>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="rounded-2xl bg-blue-50 border border-blue-100 p-3 text-center space-y-0.5">
                  <p className="text-xs font-black text-blue-600">ทีม A</p>
                  <p className="font-bold text-sm truncate">{nm(0)}</p>
                  <p className="font-bold text-sm truncate">{nm(1)}</p>
                </div>
                <span className="font-headline font-black text-slate-500">VS</span>
                <div className="rounded-2xl bg-orange-50 border border-orange-100 p-3 text-center space-y-0.5">
                  <p className="text-xs font-black text-orange-600">ทีม B</p>
                  <p className="font-bold text-sm truncate">{nm(2)}</p>
                  <p className="font-bold text-sm truncate">{nm(3)}</p>
                </div>
              </div>
              <p className="text-center text-sm font-semibold text-on-surface/55">
                ลูกแบด {promptCourt.shuttlecocks} ลูก · ฿{(promptCourt.shuttlecocks * shuttleChargePerShuttle).toFixed(0)} / คน
              </p>
              <div className="flex gap-3">
                <button onClick={() => setStartPromptId(null)}
                  className="flex-1 py-3.5 rounded-xl bg-background font-black text-sm text-on-surface/60 hover:bg-on-surface/10 transition">ยังก่อน <span className="text-[10px] opacity-60">(Esc)</span></button>
                <button onClick={startFromPrompt} autoFocus
                  className="flex-[2] py-3.5 rounded-xl bg-emerald-600 text-white font-black text-sm hover:bg-emerald-500 transition shadow-lg">▶ เริ่มเกม <span className="text-[10px] opacity-70">(Enter)</span></button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Global POS modal */}
      <AnimatePresence>
        {posTarget && (
          <POSModal member={posTarget} snacks={snacks} onAddSnack={onAddSnack} onClose={() => setPosTarget(null)} />
        )}
      </AnimatePresence>

      {/* ถามเมื่อจะจัดคนลงคอร์ทที่มีคิวรออยู่ */}
      {queueAsk && (() => {
        const court = courts.find(c => c.id === queueAsk.courtId);
        // คิวของทุกคอร์ท (คิวของคอร์ทนี้ขึ้นก่อน) — ใช้คิวไหนลงคอร์ทนี้ก็ได้
        const all = courts
          .flatMap(c => (courtQueues[c.id] || []).map((slot, idx) => ({ courtId: c.id, courtName: c.name, slot, idx })))
          .sort((a, b) => (a.courtId === queueAsk.courtId ? 0 : 1) - (b.courtId === queueAsk.courtId ? 0 : 1));
        const close = () => setQueueAsk(null);
        return (
          <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-on-surface/60 backdrop-blur-sm" onClick={close} />
            <div className="relative bg-white rounded-[2rem] p-5 sm:p-6 w-full max-w-md shadow-2xl z-10 max-h-[90vh] overflow-y-auto space-y-4">
              <button onClick={close} className="absolute top-4 right-4 p-2 hover:bg-background rounded-full"><X size={18} /></button>
              <div className="pr-8">
                <h3 className="font-headline font-black text-xl">มีคิวรออยู่ {all.length} คิว</h3>
                <p className="text-sm font-semibold text-on-surface/55">จะจัดคนลง{court?.name}เลยไหม? ใช้คิวที่จัดไว้ลงคอร์ทนี้ได้ (คิวของคอร์ทไหน หรือข้ามลำดับก็ได้) ลบคิว หรือจัดเองต่อไป</p>
              </div>
              <div className="space-y-2">
                {all.map(({ courtId, courtName, slot, idx }) => (
                  <div key={slot.id} className="rounded-2xl border border-on-surface/10 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0', idx === 0 ? 'bg-primary text-white' : 'bg-on-surface/5 text-on-surface/40')}>{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black text-primary/70">คิวของ{courtName}{courtId === queueAsk.courtId ? ' (คอร์ทนี้)' : ''}</p>
                        <p className="text-sm font-bold leading-snug">
                          {slot.teamA.map(p => p.name).join(' · ')}{slot.teamB.length > 0 && <span className="text-on-surface/30"> VS </span>}{slot.teamB.map(p => p.name).join(' · ')}
                          {slot.note && <span className="block text-xs font-semibold text-on-surface/40">{slot.note}</span>}
                        </p>
                      </div>
                      <button onClick={() => onRemoveCourtQueue(courtId, slot.id)} title="ลบคิวนี้" className="p-1.5 rounded-lg text-on-surface/30 hover:text-error hover:bg-error/5"><Trash2 size={16} /></button>
                    </div>
                    <button onClick={() => { close(); onUseQueueSlot(queueAsk.courtId, slot, courtId); }}
                      className="w-full py-2 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-500 active:scale-95 transition">
                      ▶ ใช้คิวนี้ลง{court?.name} เลย{idx > 0 || courtId !== queueAsk.courtId ? ' (ลัดคิว)' : ''}
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={() => { askedRef.current.add(queueAsk.courtId); const go = queueAsk.proceed; close(); go(); }}
                  className="flex-1 min-w-[10rem] py-3 rounded-xl bg-primary text-white text-sm font-black hover:scale-[1.02] active:scale-95 transition">
                  จัดเองต่อไป (เก็บคิวไว้)
                </button>
                <button onClick={() => { if (confirm(`ลบคิวทั้ง ${all.length} คิว?`)) all.forEach(a => onRemoveCourtQueue(a.courtId, a.slot.id)); }}
                  className="py-3 px-4 rounded-xl bg-red-50 text-red-600 text-sm font-black hover:bg-red-100 active:scale-95 transition">
                  ลบคิวทั้งหมด
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Queue Slot Editor */}
      {editingSlot && (
        <QueueSlotEditor
          members={members}
          profiles={profiles}
          queuedElsewhere={new Set(Object.values(courtQueues).flat().filter((q): q is CourtQueueSlot => !!q && q.id !== editingSlot.slot?.id).flatMap(q => [...q.teamA, ...q.teamB].map(p => p.memberId)))}
          slot={editingSlot.slot}
          onClose={() => setEditingSlot(null)}
          onSave={slot => {
            if (editingSlot.slot?.id) onUpdateCourtQueue(editingSlot.courtId, slot);
            else onAddCourtQueue(editingSlot.courtId, slot);
            setEditingSlot(null);
          }}
        />
      )}

      {/* ── Court selector ── */}
      {/* มือถือ: dropdown เลือกคอร์ท */}
      <div ref={courtMenuRef} className="md:hidden relative">
        {(() => {
          const cur = courts.find(c => c.id === selectedCourtId);
          if (!cur) {
            return <button onClick={onAddCourt} className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl font-black text-sm border-2 border-dashed border-on-surface/15 text-on-surface/50"><Plus size={18} /> เพิ่มคอร์ท</button>;
          }
          const look = courtLook(cur);
          return (
            <button onClick={() => setCourtMenuOpen(v => !v)} aria-haspopup="listbox" aria-expanded={courtMenuOpen}
              className={cn('w-full flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-2xl text-left border-2 ring-4 ring-primary/10', look.box)}>
              <CourtIcon tone={look.tone} />
              <div className="min-w-0 flex-1">
                <p className="font-headline font-black text-xl leading-tight truncate">{cur.name}</p>
                <p className={cn('text-sm font-bold truncate', look.text)}>{look.label}</p>
              </div>
              <span className="text-xs font-bold text-on-surface/40 shrink-0 hidden min-[380px]:block">{courts.length} คอร์ท</span>
              <ChevronDown size={22} className={cn('text-on-surface/50 shrink-0 transition-transform', courtMenuOpen && 'rotate-180')} />
            </button>
          );
        })()}
        {courtMenuOpen && (
          <div role="listbox" className="absolute z-40 left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-on-surface/10 max-h-[60vh] overflow-y-auto p-2 space-y-1.5">
            {courts.map(c => {
              const look = courtLook(c);
              const on = c.id === selectedCourtId;
              return (
                <button key={c.id} role="option" aria-selected={on}
                  onClick={() => { setSelectedCourtId(c.id); setCourtMenuOpen(false); }}
                  className={cn('w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left border-2 transition-colors', look.box, on ? 'ring-2 ring-primary/30' : 'opacity-90')}>
                  <CourtIcon tone={look.tone} />
                  <div className="min-w-0 flex-1">
                    <p className="font-headline font-black text-base leading-tight truncate">{c.name}</p>
                    <p className={cn('text-xs font-bold truncate', look.text)}>{look.label}</p>
                  </div>
                  {on && <Check size={18} className="text-primary shrink-0" strokeWidth={3} />}
                </button>
              );
            })}
            <button onClick={() => { setCourtMenuOpen(false); onAddCourt(); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-black text-sm border-2 border-dashed border-on-surface/15 text-on-surface/50 hover:text-primary hover:border-primary/50">
              <Plus size={16} /> เพิ่มคอร์ท
            </button>
          </div>
        )}
      </div>

      {/* iPad / desktop: การ์ดคอร์ทเรียงแถว */}
      <div className="hidden md:flex gap-3 flex-wrap xl:shrink-0">
        {courts.map(court => {
          const filled = court.players.filter(Boolean).length;
          const isSel = court.id === selectedCourtId;
          const active = court.status === 'active';
          const tone = active ? 'orange' : filled > 0 ? 'green' : 'gray';
          const mins = active && court.startTime ? format(court.startTime, 'HH:mm') : '';
          return (
            <button key={court.id} onClick={() => setSelectedCourtId(court.id)}
              className={cn('snap-start shrink-0 min-w-[14rem] md:flex-1 md:min-w-[15rem] md:max-w-[26rem] flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-2xl text-left transition-all border-2',
                tone === 'green' ? 'bg-emerald-50 border-emerald-300' : tone === 'orange' ? 'bg-orange-50 border-orange-300' : 'bg-slate-50 border-slate-200',
                isSel ? 'ring-4 ring-primary/15 shadow-md' : 'opacity-90 hover:opacity-100')}>
              <CourtIcon tone={tone} />
              <div className="min-w-0 flex-1">
                <p className="font-headline font-black text-xl leading-tight truncate">{court.name}</p>
                <p className={cn('text-sm font-bold truncate', tone === 'orange' ? 'text-orange-600' : tone === 'green' ? 'text-emerald-700' : 'text-on-surface/45')}>
                  {active ? `กำลังเล่น${mins ? ' · ' + mins : ''}` : filled > 0 ? `กำลังจัดทีม · ${filled}/4` : 'ว่าง'}
                </p>
              </div>
              <ChevronRight size={20} className="text-on-surface/35 shrink-0" />
            </button>
          );
        })}

        <button onClick={onAddCourt}
          className="snap-start shrink-0 flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-black text-sm transition-all border-2 border-dashed border-on-surface/15 text-on-surface/45 hover:border-primary/50 hover:text-primary hover:bg-primary/5">
          <Plus size={18} /> เพิ่มคอร์ท
        </button>

        <span className="hidden 2xl:flex items-center text-xs font-semibold text-on-surface/30 ml-1">
          ←/→ สลับคอร์ท • 1-4 เพิ่มผู้เล่น • Enter เริ่ม/จบเกม
        </span>
      </div>

      {selected ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 xl:gap-5 xl:flex-1 xl:min-h-0 xl:grid-rows-1">

          {/* ── Waiting Queue ── */}
          <section className="order-2 xl:order-1 xl:col-span-4 xl:min-h-0 flex flex-col gap-3"
            onDragOver={e => { if (isActive) return; e.preventDefault(); }}
            onDrop={e => {
              if (isActive) return;
              e.preventDefault();
              const srcCourtId = e.dataTransfer.getData('sourceCourtId');
              const srcSlotIndex = e.dataTransfer.getData('sourceSlotIndex');
              if (srcCourtId && srcSlotIndex !== "") {
                onRemovePlayer(srcCourtId, parseInt(srcSlotIndex));
              }
            }}
          >
            <div className="flex items-center justify-between shrink-0">
              <h3 className="font-headline font-black text-xl">ผู้เล่นที่รอจัด <span className="text-on-surface/50">({waiting.length} คน)</span></h3>
              {isActive && (
                <span className="px-3 py-1 rounded-full border-2 border-orange-300 text-orange-600 font-black text-xs">กำลังเล่น</span>
              )}
            </div>

            <div className="space-y-2 shrink-0">
              <div className="relative group">
                <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface/40 group-focus-within:text-primary transition-colors" />
                <input
                  value={localSearch}
                  onChange={e => setLocalSearch(e.target.value)}
                  placeholder="ค้นหาชื่อผู้เล่น..."
                  className="w-full pl-10 pr-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold focus:border-primary/40 transition-all outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <ArrowDownWideNarrow size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/50 pointer-events-none" />
                  <select value={sortBy} onChange={e => setSortBy(e.target.value as 'queue' | 'wait' | 'games')}
                    className="w-full pl-9 pr-8 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-black appearance-none outline-none focus:border-primary/40">
                    <option value="queue">ตามคิว</option>
                    <option value="wait">รอนานสุด</option>
                    <option value="games">เล่นน้อยสุด</option>
                  </select>
                  <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface/40 pointer-events-none" />
                </div>
                <div className="relative flex items-center gap-1 bg-white border-2 border-slate-200 rounded-xl pl-9 pr-1">
                  <BarChart3 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/50 pointer-events-none" />
                  <select value={minRankFilter} onChange={e => setMinRankFilter(e.target.value as Rank)} title="ระดับต่ำสุด"
                    className="flex-1 min-w-0 py-2.5 bg-transparent text-sm font-black appearance-none outline-none">
                    {rankOptions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <span className="text-on-surface/30 font-black">–</span>
                  <select value={maxRankFilter} onChange={e => setMaxRankFilter(e.target.value as Rank)} title="ระดับสูงสุด"
                    className="flex-1 min-w-0 py-2.5 bg-transparent text-sm font-black appearance-none outline-none text-right pr-1">
                    {rankOptions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 xl:grid-cols-1 gap-2 max-h-[26rem] xl:max-h-none xl:flex-1 xl:min-h-0 overflow-y-auto pr-1 no-scrollbar content-start">
              {waiting.map(m => {
                const waitMins = Math.max(0, Math.floor((nowTick - m.checkInTime) / 60000));
                return (
                <div key={m.id}
                  draggable={!isActive}
                  onDragStart={e => { if (isActive) return; draggingPlayerId = m.id; e.dataTransfer.setData('playerId', m.id); }}
                  onDragEnd={() => { draggingPlayerId = null; }}
                  onDoubleClick={() => handleDoubleClick(m)}
                  className={cn(
                    'bg-white rounded-2xl p-2.5 pr-3 border-2 border-slate-200 flex items-center gap-3 transition-all group',
                    isActive ? 'opacity-60 cursor-default' : 'cursor-grab active:cursor-grabbing hover:border-primary/30 hover:shadow-md'
                  )}
                >
                  {profiles[m.id]?.avatar
                    ? <img src={profiles[m.id].avatar} alt={m.name} draggable={false} className="w-11 h-11 rounded-full object-cover shrink-0" />
                    : <div className="w-11 h-11 rounded-full bg-slate-500 text-white flex items-center justify-center font-black shrink-0">{initials(m.name)}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-headline font-black text-base truncate max-w-full">{m.name}</p>
                      <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-black border', rankPill(m.rank))}>{m.rank}</span>
                    </div>
                    <p className="text-xs font-semibold text-on-surface/55 truncate">
                      เล่นแล้ว {m.gamesPlayed} เกม · รอ {waitMins} นาที
                      {m.balance > 0 && <span className="text-error font-black"> · ฿{m.balance.toFixed(0)}</span>}
                    </p>
                  </div>
                  {productsOn && <button
                    onClick={e => { e.stopPropagation(); setPosTarget(m); }}
                    className="p-2 rounded-xl text-on-surface/30 hover:text-primary hover:bg-primary/5 transition-all md:opacity-0 md:group-hover:opacity-100 shrink-0"
                    title="ซื้อสินค้า"
                  >
                    <ShoppingCart size={16} />
                  </button>}
                  <button
                    onClick={e => { e.stopPropagation(); handleDoubleClick(m); }}
                    disabled={isActive}
                    className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm hover:bg-emerald-500 active:scale-95 transition-all disabled:opacity-30"
                    title="เพิ่มเข้าคอร์ทนี้"
                  >
                    <Plus size={20} strokeWidth={3} />
                  </button>
                </div>
                );
              })}
              {waiting.length === 0 && (
                <div className="sm:col-span-2 xl:col-span-1 text-center py-10 bg-white/50 rounded-2xl border-2 border-dashed border-on-surface/10">
                  <p className="text-sm text-on-surface/30 font-bold">ไม่มีผู้เล่นรอ</p>
                </div>
              )}
            </div>

            {waiting.length > 0 && !isActive && (
              <div className="shrink-0 hidden sm:flex items-center gap-3 rounded-2xl bg-sky-50 border border-sky-100 px-4 py-2.5">
                <img src="/mascot-blue-racket.webp" alt="" draggable={false} className="w-12 h-auto select-none pointer-events-none" />
                <div className="min-w-0">
                  <p className="font-headline font-black text-sm">ยังมีผู้เล่นรออีก {waiting.length} คน</p>
                  <p className="text-xs font-semibold text-on-surface/55">กด + เพื่อเพิ่มผู้เล่นเข้าคอร์ทที่เลือก</p>
                </div>
              </div>
            )}
          </section>

          {/* ── Court Visualization ── */}
          <section className="order-1 xl:order-2 xl:col-span-8 xl:min-h-0 xl:overflow-y-auto no-scrollbar space-y-4">
            <div className="bg-white rounded-[2rem] shadow-sm border border-on-surface/5 p-4 sm:p-5 space-y-4">

              {/* Header */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-wrap">
                  <CourtIcon tone={isActive ? 'orange' : filledCount > 0 ? 'green' : 'gray'} />
                  <h2 className="font-headline font-black text-2xl sm:text-3xl truncate">{selected.name}</h2>
                  {isActive ? (
                    <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border-2 border-orange-300 bg-orange-50 text-orange-600 font-black text-sm whitespace-nowrap">
                      <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" /> กำลังเล่น{selected.startTime ? ` · ${format(selected.startTime, 'HH:mm')}` : ''}
                    </span>
                  ) : filledCount === 4 ? (
                    <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border-2 border-emerald-300 bg-emerald-50 text-emerald-700 font-black text-sm whitespace-nowrap">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> พร้อมเริ่มเกม
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border-2 border-slate-300 bg-slate-50 text-slate-600 font-black text-sm whitespace-nowrap">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> {filledCount > 0 ? 'กำลังจัดทีม' : 'ว่าง'}
                    </span>
                  )}
                </div>
                <div className={cn('text-center px-4 py-1.5 rounded-2xl border-2', filledCount === 4 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600')}>
                  <p className="font-headline font-black text-2xl leading-none">{filledCount}/4</p>
                  <p className="text-[11px] font-bold">คน</p>
                </div>
              </div>

              {/* Teams: xl = A | VS | B (ซ้อนผู้เล่นในทีม) · เล็กกว่า = A / VS / B */}
              <div className="grid gap-3 xl:grid-cols-[1fr_auto_1fr] xl:items-stretch">
                <div className="rounded-2xl p-3 space-y-3 bg-blue-50 border border-blue-100">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 font-headline font-black text-lg text-blue-700">
                      <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm">A</span> Team A
                    </h3>
                    <span className="text-sm font-black text-blue-700">{teamA.filter(Boolean).length}/2 คน</span>
                  </div>
                  <div className="grid grid-cols-2 xl:grid-cols-1 gap-2.5">
                    {[0, 1].map(i => (
                      <SlotCard key={i} slotIndex={i} courtId={selected.id} playerId={selected.players[i]} team="A"
                        members={members} profiles={profiles} onSelect={id => handleSelect(i, id)} locked={false} multi={multiPick}
                        openRequest={openSlotRequest?.slot === i ? openSlotRequest.nonce : null} />
                    ))}
                  </div>
                </div>

                <div className="flex xl:flex-col items-center gap-2">
                  <div className="flex-1 h-px xl:h-auto xl:w-px bg-on-surface/10" />
                  <span className="px-3.5 py-1.5 rounded-full border-2 border-slate-300 bg-white font-headline font-black text-sm text-slate-700">VS</span>
                  <div className="flex-1 h-px xl:h-auto xl:w-px bg-on-surface/10" />
                </div>

                <div className="rounded-2xl p-3 space-y-3 bg-orange-50 border border-orange-100">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 font-headline font-black text-lg text-orange-600">
                      <span className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm">B</span> Team B
                    </h3>
                    <span className="text-sm font-black text-orange-600">{teamB.filter(Boolean).length}/2 คน</span>
                  </div>
                  <div className="grid grid-cols-2 xl:grid-cols-1 gap-2.5">
                    {[2, 3].map(i => (
                      <SlotCard key={i} slotIndex={i} courtId={selected.id} playerId={selected.players[i]} team="B"
                        members={members} profiles={profiles} onSelect={id => handleSelect(i, id)} locked={false} multi={multiPick}
                        openRequest={openSlotRequest?.slot === i ? openSlotRequest.nonce : null} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Action bar */}
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-on-surface/5">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-on-surface/55 leading-tight hidden sm:flex items-center gap-1.5"><ShuttleIcon size={22} className="text-primary" /><span>จำนวน<br />ลูกแบด</span></span>
                  <div className="flex items-center rounded-xl bg-slate-100 border border-slate-200 overflow-hidden">
                    <button onClick={() => addShuttle(-1)} disabled={selected.shuttlecocks <= 0}
                      className="w-11 h-11 font-black text-xl hover:bg-slate-200 transition-colors disabled:opacity-30">−</button>
                    <span className="w-10 text-center font-headline font-black text-xl bg-white h-11 flex items-center justify-center">{selected.shuttlecocks}</span>
                    <button onClick={() => addShuttle(1)}
                      className="w-11 h-11 font-black text-xl hover:bg-slate-200 transition-colors">+</button>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-sm">฿</span>
                  <span className="font-headline font-black text-lg text-emerald-800">฿{(selected.shuttlecocks * shuttleChargePerShuttle).toFixed(0)} <span className="text-sm font-bold">/ คน</span></span>
                </div>

                <div className="flex flex-wrap gap-2 w-full lg:w-auto lg:ml-auto">
                  {isActive ? (
                    <button onClick={() => finishCourt(selected.id)}
                      className={cn('flex-1 lg:flex-none flex items-center justify-center gap-2 text-white px-6 py-3 rounded-xl font-black text-sm shadow-lg transition-all',
                        endGamePending ? 'bg-red-400 scale-105 animate-pulse' : 'bg-red-500 hover:bg-red-400')}>
                      <Check size={16} /> {endGamePending ? 'กด Enter อีกครั้งเพื่อจบเกม' : 'จบเกม'}
                    </button>
                  ) : (
                    <>
                      {allQueueSlots.length > 0 && (
                        <button onClick={pullFromQueue}
                          className="basis-full lg:basis-auto flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-black text-sm border-2 border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:scale-95 transition whitespace-nowrap">
                          ⏭ เอาคิวลง{selected.name} ({allQueueSlots.length} คิว)
                        </button>
                      )}
                      <button onClick={swapTeams} title="สุ่มจัดคู่ใหม่ — กดซ้ำได้จนกว่าจะถูกใจ"
                        className="flex-1 lg:flex-none border-2 border-blue-400 text-blue-700 bg-white px-4 py-3 rounded-xl font-black text-sm hover:bg-blue-50 transition flex items-center justify-center gap-2 whitespace-nowrap">
                        <RefreshCw size={16} /> สลับทีม
                      </button>
                      <button onClick={() => guardQueue(() => { expectPromptRef.current = true; onAutoMatch(selected.id); })}
                        className="flex-1 lg:flex-none border-2 border-blue-400 text-blue-700 bg-white px-4 py-3 rounded-xl font-black text-sm hover:bg-blue-50 transition flex items-center justify-center gap-2 whitespace-nowrap">
                        <Wand2 size={16} /> จัดอัตโนมัติ
                      </button>
                      <button
                        onClick={() => onStartGame(selected.id)}
                        disabled={filledCount !== 4}
                        className={cn(
                          'flex-[2] lg:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-black text-sm shadow-lg transition-all whitespace-nowrap',
                          filledCount === 4
                            ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                            : 'bg-slate-300/70 text-white cursor-not-allowed shadow-none'
                        )}>
                        <span className="text-base leading-none">▶</span> {filledCount === 4 ? 'เริ่มเกม · 4/4 คน' : 'เลือกผู้เล่นให้ครบ 4 คน'}
                      </button>
                      <button onClick={() => { if (confirm(`ยืนยันการลบ "${selected.name}"?`)) onDeleteCourt(selected.id); }}
                        className="text-on-surface/30 hover:text-red-500 p-3 rounded-xl hover:bg-red-500/10 transition-all" title="ลบคอร์ท">
                        <Trash2 size={20} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ── Game History for this court ── */}
            {courtGames.length > 0 && (
              <div className="bg-white rounded-[2rem] shadow-sm border border-on-surface/5 p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-headline font-black text-base">เกมที่ผ่านมา</h3>
                  <span className="text-xs font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full">{courtGames.length} เกม</span>
                  <span className="text-xs text-on-surface/40 font-semibold">กด +/− เพื่อแก้จำนวนลูก</span>
                </div>
                <div className="space-y-2">
                  {courtGames.map(game => (
                    <GameRow key={game.id} game={game} onEditGame={onEditGame} onUndoGame={onUndoGame} shuttlePrice={shuttlePrice} />
                  ))}
                </div>
              </div>
            )}

          {/* ── Court Queue Panel ─────────────────────────────────────────── */}
          {selected && (() => {
            const slots = courtQueues[selected.id] || [];
            return (
              <div>
                <div className="bg-white rounded-[2rem] shadow-sm border border-on-surface/5 overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-on-surface/5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                        <span className="text-lg">⏭</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-on-surface">คิวตีต่อไป</h3>
                        <p className="text-xs text-on-surface/40 font-semibold">{selected.name}</p>
                      </div>
                      {slots.length > 0 && (
                        <span className="bg-primary/10 text-primary text-sm px-2.5 py-0.5 rounded-full font-bold">{slots.length}</span>
                      )}
                    </div>
                    <button
                      onClick={() => setEditingSlot({ courtId: selected.id })}
                      className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-bold text-sm shadow-sm shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                    >
                      <Plus size={15} /> เพิ่มคิว
                    </button>
                  </div>

                  {slots.length === 0 ? (
                    <div className="px-6 py-10 text-center">
                      <p className="text-on-surface/25 font-semibold text-sm">ยังไม่มีคิวตี — กด "เพิ่มคิว" เพื่อจัดล่วงหน้า</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-on-surface/5">
                      {slots.map((slot, idx) => {
                        const allPlayers = [...slot.teamA, ...slot.teamB];
                        return (
                          <div key={slot.id} className="px-6 py-4 flex items-center gap-4">
                            {/* Number */}
                            <div className={cn(
                              'w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0',
                              idx === 0 ? 'bg-primary text-white' : 'bg-on-surface/5 text-on-surface/40'
                            )}>
                              {idx + 1}
                            </div>

                            {/* Players */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {slot.teamA.map((p, i) => (
                                    <div key={i} className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-bold', RANK_COLORS[p.rank])}>
                                      <span className="text-xs font-bold opacity-70">{p.rank}</span>
                                      <span>{p.name}</span>
                                    </div>
                                  ))}
                                </div>
                                {slot.teamA.length > 0 && slot.teamB.length > 0 && (
                                  <span className="text-on-surface/25 font-black text-xs">VS</span>
                                )}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {slot.teamB.map((p, i) => (
                                    <div key={i} className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-bold', RANK_COLORS[p.rank])}>
                                      <span className="text-xs font-bold opacity-70">{p.rank}</span>
                                      <span>{p.name}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {slot.note && (
                                <p className="text-xs text-on-surface/40 font-semibold mt-1">{slot.note}</p>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => onMoveCourtQueue(selected.id, slot.id, 'up')}
                                disabled={idx === 0}
                                className="p-1.5 rounded-lg text-on-surface/20 hover:text-primary hover:bg-primary/5 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                                title="เลื่อนขึ้น"
                              >
                                <ChevronDown size={16} className="rotate-180" />
                              </button>
                              <button
                                onClick={() => onMoveCourtQueue(selected.id, slot.id, 'down')}
                                disabled={idx === slots.length - 1}
                                className="p-1.5 rounded-lg text-on-surface/20 hover:text-primary hover:bg-primary/5 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                                title="เลื่อนลง"
                              >
                                <ChevronDown size={16} />
                              </button>
                              <button
                                onClick={() => setEditingSlot({ courtId: selected.id, slot })}
                                className="p-1.5 rounded-lg text-on-surface/20 hover:text-primary hover:bg-primary/5 transition-all"
                                title="แก้ไข"
                              >
                                <RotateCcw size={15} />
                              </button>
                              <button
                                onClick={() => onRemoveCourtQueue(selected.id, slot.id)}
                                className="p-1.5 rounded-lg text-on-surface/20 hover:text-error hover:bg-error/5 transition-all"
                                title="ลบ"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          </section>
        </div>
      ) : (
        <div className="text-center py-24 bg-white/60 rounded-3xl border-2 border-dashed border-on-surface/10">
          <p className="font-bold text-on-surface/40 text-lg">กด "+ เพิ่มคอร์ด" เพื่อเริ่มต้น</p>
        </div>
      )}
    </div>
  );
}
