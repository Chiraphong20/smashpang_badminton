import React, { useState, useEffect, useMemo } from 'react';
import { X, FileText, UserPlus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Rank, RANKS, RANK_COLORS, RANK_LEVEL_LABELS } from '../types';
import { parseLineNames } from '../lib/lineNames';

interface ParsedMember {
  id: string;
  name: string;
  rank: Rank;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (members: { name: string; rank: Rank }[], isSession: boolean) => void;
  rankMemory: Record<string, Rank>;
  existingNames: string[];
  /** ชื่อสมาชิกเดิม(ตัวพิมพ์เล็ก) → ระดับมือปัจจุบัน ใช้แยก "คนเดิม" กับ "คนชื่อซ้ำ" */
  existingRanks?: Record<string, Rank>;
  /** ข้อจำกัดจำนวนผู้เล่นต่อวันตามแพ็กเกจ */
  capacity?: { max: number; current: number };
  isSessionMode?: boolean;
  /** คนที่อยู่ในก๊วนวันนี้แล้ว: ชื่อ(ตัวพิมพ์เล็ก) → จำนวนเกมที่ตีไปแล้ว */
  todayGames?: Record<string, number>;
  /** เปิดมาพร้อมข้อความนี้และวิเคราะห์ให้เลย (เช่น รายชื่อที่ลงชื่อล่วงหน้า) */
  initialText?: string;
}

// Parse LINE signup text → ชื่อ (และระดับมือถ้าพิมพ์มา) · ดู src/lib/lineNames.ts
const parseLine = parseLineNames;

// Parse Master List text → {name, rank}
function parseMasterList(text: string): { name: string; rank: Rank }[] {
  const lines = text.split('\n');
  const results: { name: string; rank: Rank }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Pattern: "Name Rank" or "Name, Rank" or "Name\tRank"
    const parts = trimmed.split(/[\s,\t]+/).filter(Boolean);
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1].toUpperCase();
      const rankMatch = lastPart.match(/^(VIP\d?|BG\d?|S-?\d?|P[+-]?)$/);
      
      if (rankMatch) {
        const rank = rankMatch[1];
        const name = parts.slice(0, parts.length - 1).join(' ');
        results.push({ name, rank: rank as Rank });
      }
    }
  }
  return results;
}

export function ImportMembersModal({ open, onClose, onImport, rankMemory, existingNames, existingRanks = {}, capacity, isSessionMode, todayGames = {}, initialText }: Props) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedMember[]>([]);
  const [step, setStep] = useState<'paste' | 'confirm'>('paste');
  const [mode] = useState<'line' | 'master'>('line');
  // เวลาที่เพิ่งเข้าสู่หน้ายืนยัน — ใช้กัน Enter ที่กด "ติดกันไวเกินไป" (ไม่ว่าจะกดค้างหรือกดซ้ำสองที
  // จริงๆ ก็ตาม) ไม่ให้ไปโดนเงื่อนไข "นำเข้า" ทันทีก่อนจะได้เห็นหน้าจอเปลี่ยนเป็นหน้ายืนยันเลือกมือ
  const confirmEnteredAtRef = React.useRef(0);

  const handleParse = (override?: string) => {
    if (mode === 'line') {
      const results = parseLine(override ?? text);
      if (results.length === 0) { alert('ไม่พบรายชื่อ — วางข้อความลงชื่อที่ขึ้นต้นด้วยเลขข้อ เช่น "1. ชื่อ"'); return; }
      setParsed(results.map((res, i) => ({
        id: `import-${i}`,
        name: res.name,
        rank: res.rank || existingRanks[res.name.trim().toLowerCase()] || rankMemory[res.name] || ('P' as Rank)
      })));
      setStep('confirm');
      confirmEnteredAtRef.current = Date.now();
    } else {
      const results = parseMasterList(text);
      if (results.length === 0) { alert('ไม่พบข้อมูลรูปเเบบ "ชื่อ ระดับมือ" (ตัวอย่าง: บู S1)'); return; }
      setParsed(results.map((res, i) => ({
        id: `master-${i}`,
        name: res.name,
        rank: res.rank
      })));
      setStep('confirm');
      confirmEnteredAtRef.current = Date.now();
    }
  };

  // เปิดพร้อมข้อความที่เตรียมไว้ → วิเคราะห์ทันที
  useEffect(() => {
    if (open && initialText) { setText(initialText); handleParse(initialText); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialText]);

  const updateRank = (id: string, rank: Rank) => {
    setParsed(prev => prev.map(p => p.id === id ? { ...p, rank } : p));
  };
  const updateName = (id: string, name: string) => {
    setParsed(prev => prev.map(p => p.id === id ? { ...p, name } : p));
  };
  const removeParsed = (id: string) => {
    setParsed(prev => prev.filter(p => p.id !== id));
  };

  // กติกาชื่อซ้ำ (ดูแค่ชื่อกับระดับมือ ไม่ถามว่าใช่คนเดียวกันไหม):
  //  · ชื่อตรงสมาชิกเดิมและระดับมือเท่ากัน → คนเดิม นำเข้าเลย
  //  · ชื่อซ้ำแต่ระดับมือต่างกัน → ถือเป็นคนละคน ต่อท้ายชื่อด้วยระดับมือ เช่น "เน็ต S1"
  //  · ชื่อซ้ำและระดับมือเท่ากัน (ซ้ำกันเองในรายการ) → บังคับให้เปลี่ยนชื่อ
  type Status = 'new' | 'member' | 'renamed' | 'blocked' | 'empty';
  const resolved = useMemo(() => {
    const claimed = new Map<string, Rank>();
    return parsed.map((p): { final: string; status: Status } => {
      const base = p.name.trim();
      if (!base) return { final: '', status: 'empty' };
      const attempt = (n: string): 'new' | 'member' | 'same' | 'diff' => {
        const k = n.toLowerCase();
        if (claimed.has(k)) return claimed.get(k) === p.rank ? 'same' : 'diff';
        const ex = existingRanks[k];
        if (ex === undefined) return existingNames.some(x => x.trim().toLowerCase() === k) ? 'member' : 'new';
        return ex === p.rank ? 'member' : 'diff';
      };
      let final = base; let status: Status;
      const r = attempt(base);
      if (r === 'new' || r === 'member') status = r;
      else if (r === 'same') status = 'blocked';
      else {
        final = `${base} ${p.rank}`;
        const r2 = attempt(final);
        if (r2 === 'new' || r2 === 'member') status = 'renamed';
        else { final = base; status = 'blocked'; }
      }
      if (status !== 'blocked') claimed.set(final.toLowerCase(), p.rank);
      return { final, status };
    });
  }, [parsed, existingNames, existingRanks]);

  // คนที่อยู่ในก๊วนวันนี้แล้ว (ชื่อ+ระดับมือตรงกัน) จะถูกข้าม ไม่รีเซ็ตยอดของคนเดิม
  const todayOf = (i: number) => (isSessionMode && resolved[i] && resolved[i].status !== 'blocked' && resolved[i].status !== 'empty' ? todayGames[resolved[i].final.toLowerCase()] : undefined);
  const isSkipped = (i: number) => todayOf(i) !== undefined;
  const importableIdx = parsed.map((_, i) => i).filter(i => resolved[i].status !== 'empty' && resolved[i].status !== 'blocked' && !isSkipped(i));
  const blockedIdx = parsed.map((_, i) => i).filter(i => resolved[i].status === 'blocked');
  const count = (st: Status) => parsed.filter((_, i) => resolved[i].status === st && !isSkipped(i)).length;
  const skippedCount = parsed.filter((_, i) => isSkipped(i)).length;
  const room = capacity ? capacity.max - capacity.current : null;
  const overCapacity = !!isSessionMode && room !== null && importableIdx.length > room;

  const handleImport = () => {
    if (blockedIdx.length > 0) {
      alert(`มี ${blockedIdx.length} ชื่อที่ซ้ำทั้งชื่อและระดับมือ กรุณาเปลี่ยนชื่อให้ต่างกันก่อนนำเข้า`);
      return;
    }
    if (importableIdx.length === 0) { alert('ไม่พบรายชื่อให้นำเข้า'); return; }
    onImport(importableIdx.map(i => ({ name: resolved[i].final, rank: parsed[i].rank })), isSessionMode || false);
    setText('');
    setParsed([]);
    setStep('paste');
    onClose();
  };

  const handleClose = () => {
    setText(''); setParsed([]); setStep('paste');
    onClose();
  };

  // Esc closes, Enter imports (once on the confirm step) — a window listener so this still
  // works after the textarea unmounts and focus falls back to <body> (a plain onKeyDown on the
  // modal div would miss that Enter press, since body isn't a descendant of the modal container).
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key === 'Enter' && step === 'confirm' && parsed.length > 0) {
        e.preventDefault();
        // ต้องรอสักครู่หลังเข้าหน้ายืนยัน (กันกด Enter ติดกันเร็วเกินไป — ไม่ว่าจะกดค้างหรือกดซ้ำเอง
        // ก็ตาม — ไปโดนนำเข้าทันทีก่อนได้เห็น/แก้ระดับมือของแต่ละคนเลย)
        if (Date.now() - confirmEnteredAtRef.current < 500) return;
        handleImport();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, parsed]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-on-surface/50 backdrop-blur-sm" />
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl relative z-10 flex flex-col max-h-[90vh] outline-none">

        {/* Header */}
        <div className="flex items-center gap-4 p-6 border-b border-on-surface/5 shrink-0">
          <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", isSessionMode ? "bg-primary/10" : "bg-secondary/10")}>
            <FileText size={22} className={isSessionMode ? "text-primary" : "text-secondary"} />
          </div>
          <div className="flex-1">
            <h2 className="font-headline font-black text-xl">
              {isSessionMode ? 'ลงชื่อร่วมเซสชัน (รายวัน)' : 'เพิ่มสมาชิกเข้าฐานข้อมูล'}
            </h2>
            <div className="flex gap-4 mt-1">
              <span className="text-xs font-semibold text-primary italic">
                จากคิวไลน์ (LINE Queue)
              </span>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-full hover:bg-background"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
          {step === 'paste' ? (
            <>
              {/* Example */}
              <div className="bg-primary/5 rounded-2xl p-4 text-xs space-y-1">
                <p className="font-bold text-primary text-xs mb-2">
                  {mode === 'line' ? 'ตัวอย่างรายชื่อที่ระบบรองรับ' : 'ตัวอย่างรูปแบบฐานข้อมูล'}
                </p>
                {mode === 'line' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-on-surface/60 font-mono">1. บิ๊ก 17:30</p>
                      <p className="text-on-surface/60 font-mono">2. โรส ค่ะ (พัก)</p>
                      <p className="text-on-surface/60 font-mono">3. โย S1</p>
                    </div>
                    <div className="text-on-surface/40 italic">
                      <p>✨ ระบบจะคลีน "ค่ะ", "เวลา", และ "หมายเหตุ" ออกให้อัตโนมัติ</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-on-surface/60 font-mono">เน็ต S1</p>
                    <p className="text-on-surface/60 font-mono">น้ำ P</p>
                    <p className="text-on-surface/60 font-mono">พี่โย VIP2</p>
                  </>
                )}
              </div>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                  // Enter วิเคราะห์รายชื่อทันที, Shift+Enter ขึ้นบรรทัดใหม่ (สำหรับแก้ไข/พิมพ์เพิ่มเอง)
                  // e.repeat กัน auto-repeat จากการกด Enter ค้าง (ดูคอมเมนต์ที่ window listener ด้านบน)
                  if (e.key === 'Enter' && !e.shiftKey && !e.repeat) {
                    e.preventDefault();
                    if (text.trim()) handleParse();
                  }
                }}
                placeholder={mode === 'line' ? 'ก๊อปปี้รายชื่อจากไลน์มาวางที่นี่...' : 'วางชื่อและระดับมือ...'}
                className="w-full h-72 px-4 py-3 bg-background rounded-2xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                autoFocus
              />
              <p className="text-[11px] text-on-surface/30 font-semibold px-1">
                กด Enter เพื่อวิเคราะห์รายชื่อ • Shift+Enter เพื่อขึ้นบรรทัดใหม่
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <div className="rounded-2xl bg-primary/5 px-4 py-3 text-sm font-bold text-primary flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-black">จะนำเข้า {importableIdx.length} คน</span>
                {count('member') > 0 && <span className="text-xs text-on-surface/60">สมาชิกเดิม {count('member')}</span>}
                {count('new') + count('renamed') > 0 && <span className="text-xs text-on-surface/60">คนใหม่ {count('new') + count('renamed')}</span>}
                {skippedCount > 0 && <span className="text-xs text-on-surface/60">อยู่ในก๊วนวันนี้แล้ว (ข้าม) {skippedCount}</span>}
                {isSessionMode && room !== null && <span className={cn('text-xs', overCapacity ? 'text-error font-black' : 'text-on-surface/60')}>เพิ่มได้อีก {Math.max(0, room)} คน (แพ็กเกจรองรับ {capacity!.max})</span>}
              </div>
              {overCapacity && <p className="text-xs font-black text-error px-1">⚠ เกินจำนวนที่แพ็กเกจรองรับ {importableIdx.length - room!} คน — ลบบางชื่อออก หรืออัปเกรดแพ็กเกจ</p>}
              {blockedIdx.length > 0 && <p className="text-xs font-black text-error px-1">⚠ มี {blockedIdx.length} ชื่อที่ซ้ำทั้งชื่อและระดับมือ — ต้องเปลี่ยนชื่อ หรือถ้าเป็นคนละระดับให้เลือกระดับมือใหม่ก่อนนำเข้า</p>}
              {parsed.map((p, idx) => {
                const r = resolved[idx];
                const skipped = isSkipped(idx);
                return (
                  <div key={p.id} className={cn("flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 rounded-2xl px-3 sm:px-4 py-3 transition-colors", r.status === 'blocked' ? 'bg-red-50 ring-1 ring-red-300' : r.status === 'member' ? 'bg-primary/5' : 'bg-background', skipped && 'opacity-60')}>
                    <span className="text-xs font-black text-on-surface/30 w-6 text-center shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0 basis-[calc(100%-6.5rem)] sm:basis-0">
                      <input
                        id={`imp-name-${p.id}`}
                        value={p.name}
                        onChange={e => updateName(p.id, e.target.value)}
                        className={cn("w-full bg-transparent font-bold text-sm focus:outline-none truncate", r.status === 'member' ? "text-primary" : "text-on-surface")}
                      />
                      {skipped && <p className="text-xs font-semibold text-on-surface/50 leading-none">{todayOf(idx)! > 0 ? `ตีไปแล้ว ${todayOf(idx)} เกม` : 'อยู่ในก๊วนวันนี้แล้ว'} — ข้าม</p>}
                      {!skipped && r.status === 'member' && <p className="text-xs font-semibold text-primary/60 leading-none">สมาชิกเดิม ✓</p>}
                      {!skipped && r.status === 'new' && <p className="text-xs font-semibold text-secondary leading-none">คนใหม่ 👤</p>}
                      {!skipped && r.status === 'renamed' && <p className="text-xs font-bold text-amber-700 leading-snug">ชื่อซ้ำคนละระดับมือ → นำเข้าเป็น “{r.final}”</p>}
                      {r.status === 'blocked' && <p className="text-xs font-black text-error leading-snug">ชื่อและระดับมือซ้ำกับคนอื่น — แก้ชื่อตรงนี้</p>}
                    </div>
                    {/* Rank selector */}
                    <div className="order-3 sm:order-none basis-full sm:basis-auto grid grid-cols-8 sm:grid-cols-5 gap-1 sm:shrink-0">
                      {RANKS.map(r => (
                        <button key={r} onClick={() => updateRank(p.id, r)}
                          title={RANK_LEVEL_LABELS[r]}
                          className={cn(
                            'w-full sm:w-7 aspect-square sm:aspect-auto sm:h-7 rounded-lg text-[10px] sm:text-xs font-bold transition-all border-2 border-transparent',
                            p.rank === r
                              ? RANK_COLORS[r] + ' border-primary shadow-sm scale-110'
                              : 'bg-on-surface/5 text-on-surface/40 hover:bg-on-surface/10'
                          )}>
                          {r}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => removeParsed(p.id)}
                      className="order-2 sm:order-none text-on-surface/20 hover:text-error p-1 shrink-0 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-on-surface/5 flex items-center gap-3 shrink-0">
          {step === 'confirm' && (
            <button onClick={() => setStep('paste')}
              className="px-5 py-3 rounded-2xl font-bold text-sm text-on-surface/60 hover:bg-background transition-colors">
              ← แก้ข้อความ
            </button>
          )}
          <div className="flex-1" />
          <button onClick={handleClose}
            className="px-5 py-3 rounded-2xl font-bold text-sm text-on-surface/60 hover:bg-background transition-colors">
            ยกเลิก
          </button>
          {step === 'paste' ? (
            <button onClick={() => handleParse()} disabled={!text.trim()}
              className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-black text-sm disabled:opacity-40 hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-primary/20">
              วิเคราะห์รายชื่อ →
            </button>
          ) : (
            <button onClick={handleImport} disabled={importableIdx.length === 0 || blockedIdx.length > 0}
              className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-black text-sm disabled:opacity-40 hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-primary/20">
              <UserPlus size={16} />
              นำเข้า {importableIdx.length} คน{skippedCount > 0 ? ` (ข้าม ${skippedCount})` : ''}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
