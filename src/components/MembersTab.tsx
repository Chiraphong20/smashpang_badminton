import React, { useEffect, useState } from 'react';
import { UserPlus, Trash2, ChevronRight, FileText, X, Search, UserRound, LayoutGrid, List, Camera, ChevronLeft, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { RankPickerModal } from './RankPickerModal';
import { Member, Rank, RANKS, RANK_COLORS, RANK_LEVEL_LABELS, GameRecord, SessionRecord, PlayerProfile } from '../types';
import { PlayerProfileModal } from './PlayerProfileModal';
import { PlayerBadge } from './Avatar';
import { SkillBoard } from './SkillBoard';
import { BulkAvatarModal } from './BulkAvatarModal';

interface Props {
  members: Member[];
  groupName?: string;
  gameHistory?: GameRecord[];
  sessionHistory?: SessionRecord[];
  profiles?: Record<string, PlayerProfile>;
  onSaveProfile?: (id: string, profile: PlayerProfile) => void;
  searchQuery: string;
  onSearch: (query: string) => void;
  onRemove: (id: string) => void;
  onAddMember: () => void;
  onImportLine: () => void;
  onUpdateRank: (memberId: string, rank: Rank) => void;
  onUpdateName: (memberId: string, name: string) => void;
  onAddCourt: () => void;
  onCheckIn: (memberId: string) => void;
  onBulkCheckIn: (ids: string[]) => void;
  onBulkRemove: (ids: string[]) => void;
  onBulkUpdateRank: (ids: string[], rank: Rank) => void;
}



type Filter = 'all' | 'waiting' | 'playing' | 'resting';

// ยอดที่ถูกคิดวันนี้ทั้งหมด และส่วนที่จ่ายไปแล้ว (ค้าง = ยอดรวม − จ่ายแล้ว) ใช้อธิบายว่าทำไมบางคนค้างน้อยกว่าคนอื่น
const chargedOf = (m: Member) => Math.round((m.totalCourt || 0) + (m.totalShuttle || 0) + (m.totalSnack || 0));
const paidOf = (m: Member) => Math.max(0, chargedOf(m) - Math.round(m.balance));

export function MembersTab({ 
  members, groupName = '', gameHistory = [], sessionHistory = [], profiles = {}, onSaveProfile, searchQuery, onSearch, onRemove, onAddMember, onImportLine, 
  onUpdateRank, onUpdateName, onAddCourt, onCheckIn,
  onBulkCheckIn, onBulkRemove, onBulkUpdateRank
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [showBulkRank, setShowBulkRank] = useState(false);
  const [rankPickId, setRankPickId] = useState<string | null>(null);
  const [showBulkAvatar, setShowBulkAvatar] = useState(false);
  const [pageSize, setPageSize] = useState<number>(() => { try { const v = Number(localStorage.getItem('sp_members_pagesize')); return [12, 24, 48].includes(v) ? v : 12; } catch { return 12; } });
  const [page, setPage] = useState(1);

  const filtered = members.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchFilter = filter === 'all' || m.status === filter;
    return matchSearch && matchFilter;
  }).sort((a, b) => a.checkInTime - b.checkInTime);

  // แบ่งหน้า: กลับไปหน้า 1 เมื่อเปลี่ยนตัวกรอง/คำค้น และไม่ให้เกินจำนวนหน้าที่มี (เช่น หลังลบคน)
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const curPage = Math.min(page, pageCount);
  const paged = filtered.slice((curPage - 1) * pageSize, curPage * pageSize);
  useEffect(() => { setPage(1); }, [filter, searchQuery, pageSize]);
  const changePageSize = (n: number) => { setPageSize(n); try { localStorage.setItem('sp_members_pagesize', String(n)); } catch { /* storage blocked */ } };
  const pageNums = (() => {
    const out: (number | '…')[] = [];
    for (let i = 1; i <= pageCount; i++) {
      if (i === 1 || i === pageCount || Math.abs(i - curPage) <= 1) out.push(i);
      else if (out[out.length - 1] !== '…') out.push('…');
    }
    return out;
  })();

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: `ทั้งหมด (${members.length})` },
    { id: 'waiting', label: `รอ (${members.filter(m => m.status === 'waiting').length})` },
    { id: 'playing', label: `เล่น (${members.filter(m => m.status === 'playing').length})` },
    { id: 'resting', label: `พัก (${members.filter(m => m.status === 'resting').length})` },
  ];

  return (
    <div className="space-y-6 pb-32">
      {/* Search and Main Actions */}
      <div className="bg-white rounded-3xl p-4 shadow-sm border border-on-surface/5 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="ค้นหาชื่อสมาชิก..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full bg-background border-none rounded-2xl py-3 pl-12 pr-4 font-bold text-on-surface focus:ring-2 focus:ring-primary/20 transition-all outline-none"
          />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface/30">
            <Search size={20} />
          </div>
          {searchQuery && (
            <button onClick={() => onSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface/30 hover:text-on-surface">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onSaveProfile && (
            <button onClick={() => setShowBulkAvatar(true)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-tertiary/10 text-tertiary px-5 py-3 rounded-2xl font-bold text-sm hover:bg-tertiary/20 transition-all">
              <Camera size={16} /> รูปหลายคน
            </button>
          )}
          <button onClick={onImportLine}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-secondary/10 text-secondary px-5 py-3 rounded-2xl font-bold text-sm hover:bg-secondary/20 transition-all">
            <FileText size={16} /> นำเข้าไลน์
          </button>
          <button onClick={onAddMember}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
            <UserPlus size={16} /> เพิ่มสมาชิกใหม่
          </button>
        </div>
      </div>

      {/* มุมมอง: รายการ / ตารางระดับมือ */}
      <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-on-surface/5 w-fit">
        <button onClick={() => setView('list')} className={cn('flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black', view === 'list' ? 'bg-primary text-white' : 'text-on-surface/55')}><List size={15} /> รายการ</button>
        <button onClick={() => setView('board')} className={cn('flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black', view === 'board' ? 'bg-primary text-white' : 'text-on-surface/55')}><LayoutGrid size={15} /> ตารางระดับมือ</button>
      </div>

      {view === 'board' ? (
        <SkillBoard members={members} profiles={profiles} groupName={groupName || 'ก๊วนของเรา'} onOpenProfile={setProfileId} />
      ) : (<>
      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex gap-2 flex-wrap">
          {filters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={cn('px-4 py-2 rounded-full font-semibold text-sm transition-all',
                filter === f.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white text-on-surface/60 hover:bg-white/80')}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Select All / Deselect All */}
        {filtered.length > 0 && (
          <div className="col-span-full flex items-center gap-4 px-2">
             <button
               onClick={() => setSelectedIds(prev => paged.every(m => prev.includes(m.id)) ? prev.filter(id => !paged.some(m => m.id === id)) : [...new Set([...prev, ...paged.map(m => m.id)])])}
               className="text-xs font-bold text-primary hover:underline"
             >
               {paged.every(m => selectedIds.includes(m.id)) ? 'ยกเลิกการเลือกในหน้านี้' : 'เลือกทั้งหมดในหน้านี้'}
             </button>
             {selectedIds.length > 0 && (
               <span className="text-xs font-semibold text-on-surface/50">เลือกอยู่ {selectedIds.length} คน</span>
             )}
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {paged.map(member => {
            const isSelected = selectedIds.includes(member.id);
            return (
              <motion.div key={member.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => setSelectedIds(prev => isSelected ? prev.filter(id => id !== member.id) : [...prev, member.id])}
                className={cn(
                  "bg-white rounded-3xl p-5 shadow-sm border transition-all relative group cursor-pointer",
                  isSelected ? "border-primary ring-2 ring-primary/10 bg-primary/5" : "border-on-surface/5"
                )}>
                
                {/* Selection Overlay/Checkbox */}
                <div className={cn(
                  "absolute top-4 right-4 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all z-10",
                  isSelected ? "bg-primary border-primary text-white" : "border-on-surface/10 bg-white"
                )}>
                  {isSelected && <ChevronRight size={14} strokeWidth={4} className="rotate-90" />}
                </div>

                <div className="flex items-start gap-4">
                <button type="button" onClick={(e) => { e.stopPropagation(); setRankPickId(member.id); }} aria-label={`เปลี่ยนระดับมือของ ${member.name}`}
                  className="relative group/rank shrink-0 active:scale-95 transition-transform">
                  <PlayerBadge zoom rank={member.rank} name={member.name} profile={profiles[member.id]} className="w-14 h-14 rounded-2xl text-base transition-transform group-hover/rank:scale-105" />
                  <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-white shadow ring-1 ring-on-surface/10 flex items-center justify-center text-[10px]">✎</span>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="group/name relative">
                    <h3 className="font-bold text-base text-on-surface truncate group-hover/name:opacity-0 transition-opacity">{member.name}</h3>
                    <input
                      className="absolute inset-0 w-full bg-background border-none p-0 font-bold text-base text-primary opacity-0 focus:opacity-100 group-hover/name:opacity-100 transition-opacity focus:ring-0 rounded-lg"
                      value={member.name}
                      autoFocus={false}
                      onChange={(e) => onUpdateName(member.id, e.target.value)}
                    />
                  </div>
                  {profiles[member.id]?.nickname && <p className="text-xs font-semibold text-on-surface/50 truncate">“{profiles[member.id]!.nickname}”</p>}
                  {RANK_LEVEL_LABELS[member.rank] && <p className="text-xs font-bold text-primary">{RANK_LEVEL_LABELS[member.rank]}</p>}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs font-semibold text-on-surface/45">{member.gamesPlayed} เกม</span>
                    <span className="text-xs text-on-surface/20">•</span>
                    <span className="text-xs font-semibold text-on-surface/40">
                      รอ: {Math.floor((Date.now() - member.checkInTime) / 60000)} นาที
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-on-surface/5">
                <div className="flex items-center gap-2">
                  <div className={cn('text-xs font-semibold px-3 py-1 rounded-full',
                    member.status === 'playing' ? 'bg-tertiary/10 text-tertiary' :
                    member.status === 'waiting' ? 'bg-secondary/10 text-secondary' :
                    'bg-on-surface/5 text-on-surface/40')}>
                    {member.status === 'playing' ? '🏸 เล่นอยู่' : member.status === 'waiting' ? '⏳ รอในคิว' : '💤 พักผ่อน'}
                  </div>
                  {member.status === 'resting' && (
                    <button
                      onClick={() => onCheckIn(member.id)}
                      className="text-xs font-bold bg-primary text-white px-3 py-1 rounded-full hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm shadow-primary/20"
                    >
                      <UserPlus size={12} strokeWidth={2.5} /> เช็คอิน
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); setProfileId(member.id); }}
                    className="flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-full transition-colors">
                    <UserRound size={12} /> โปรไฟล์
                  </button>
                  {member.balance > 0 && (
                    <span className="text-xs font-black text-error" title={paidOf(member) > 0 ? `ยอดรวม ฿${chargedOf(member)} · จ่ายไปแล้ว ฿${paidOf(member)}` : undefined}>
                      ฿{member.balance.toFixed(0)}{paidOf(member) > 0 && <span className="ml-1 font-bold text-on-surface/40">(จ่ายแล้ว ฿{paidOf(member)})</span>}
                    </span>
                  )}
                  {confirmDelete === member.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => { onRemove(member.id); setConfirmDelete(null); }}
                        className="text-xs bg-error text-white px-2.5 py-1 rounded-lg font-bold">ลบ</button>
                      <button onClick={() => setConfirmDelete(null)}
                        className="text-xs bg-on-surface/10 px-2.5 py-1 rounded-lg font-bold">ยกเลิก</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(member.id)}
                      className="opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 text-on-surface/30 hover:text-error transition-all">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>

      {/* แบ่งหน้า */}
      {filtered.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
          <p className="text-xs font-bold text-on-surface/50">
            แสดง {(curPage - 1) * pageSize + 1}–{Math.min(curPage * pageSize, filtered.length)} จาก {filtered.length} คน
          </p>
          {pageCount > 1 && (
            <nav className="flex items-center gap-1" aria-label="เลือกหน้า">
              <button onClick={() => setPage(1)} disabled={curPage === 1} aria-label="หน้าแรก" className="w-9 h-9 rounded-xl bg-white border border-on-surface/10 flex items-center justify-center disabled:opacity-30"><ChevronsLeft size={16} /></button>
              <button onClick={() => setPage(curPage - 1)} disabled={curPage === 1} aria-label="หน้าก่อน" className="w-9 h-9 rounded-xl bg-white border border-on-surface/10 flex items-center justify-center disabled:opacity-30"><ChevronLeft size={16} /></button>
              {pageNums.map((n, i) => n === '…'
                ? <span key={'e' + i} className="w-6 text-center text-on-surface/30 font-black">…</span>
                : <button key={n} onClick={() => setPage(n)} aria-current={n === curPage ? 'page' : undefined}
                    className={cn('min-w-9 h-9 px-2 rounded-xl font-black text-sm border', n === curPage ? 'bg-primary text-white border-primary shadow' : 'bg-white border-on-surface/10 text-on-surface/70 hover:border-primary/40')}>{n}</button>)}
              <button onClick={() => setPage(curPage + 1)} disabled={curPage === pageCount} aria-label="หน้าถัดไป" className="w-9 h-9 rounded-xl bg-white border border-on-surface/10 flex items-center justify-center disabled:opacity-30"><ChevronRight size={16} /></button>
              <button onClick={() => setPage(pageCount)} disabled={curPage === pageCount} aria-label="หน้าสุดท้าย" className="w-9 h-9 rounded-xl bg-white border border-on-surface/10 flex items-center justify-center disabled:opacity-30"><ChevronsRight size={16} /></button>
            </nav>
          )}
          <label className="flex items-center gap-2 text-xs font-bold text-on-surface/50">
            ต่อหน้า
            <select value={pageSize} onChange={e => changePageSize(Number(e.target.value))} className="px-2 py-1.5 rounded-lg bg-white border border-on-surface/10 font-black text-on-surface">
              {[12, 24, 48].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}

      {/* Bulk Action Toolbar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-2xl bg-on-surface text-white rounded-[2rem] p-4 shadow-2xl flex flex-wrap items-center justify-between gap-4"
          >
            <div className="flex items-center gap-4 px-2">
              <div className="flex -space-x-2">
                {selectedIds.slice(0, 3).map(id => {
                  const m = members.find(x => x.id === id);
                  return (
                    <div key={id} className={cn("w-8 h-8 rounded-full border-2 border-on-surface flex items-center justify-center text-xs font-bold", RANK_COLORS[m?.rank || 'P'])}>
                      {m?.name.charAt(0)}
                    </div>
                  );
                })}
                {selectedIds.length > 3 && (
                  <div className="w-8 h-8 rounded-full border-2 border-on-surface bg-on-surface-variant flex items-center justify-center text-xs font-bold">
                    +{selectedIds.length - 3}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-black">เลือก {selectedIds.length} รายชื่อ</p>
                <p className="text-xs text-white/40 font-semibold">จัดการแบบกลุ่ม</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 justify-end">
              <div className="relative">
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowBulkRank(!showBulkRank); }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold flex items-center gap-2"
                >
                  เปลี่ยนระดับมือ <ChevronRight size={12} className={cn("transition-transform", showBulkRank ? "-rotate-90" : "rotate-90")} />
                </button>
                {showBulkRank && (
                  <RankPickerModal title={`เปลี่ยนระดับมือ ${selectedIds.length} คน`} subtitle="แตะระดับที่ต้องการ ใช้กับทุกคนที่เลือก"
                    onPick={r => { onBulkUpdateRank(selectedIds, r); setSelectedIds([]); setShowBulkRank(false); }} onClose={() => setShowBulkRank(false)} />
                )}
              </div>
              <button 
                onClick={() => { onBulkCheckIn(selectedIds); setSelectedIds([]); }}
                className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                <UserPlus size={14} /> เช็คอิน
              </button>
              <button 
                onClick={() => { if(confirm(`ลบ ${selectedIds.length} รายชื่อที่เลือกใช่หรือไม่?`)) { onBulkRemove(selectedIds); setSelectedIds([]); } }}
                className="p-2 text-white/40 hover:text-error transition-colors"
                title="ลบที่เลือก"
              >
                <Trash2 size={18} />
              </button>
              <button 
                onClick={() => setSelectedIds([])}
                className="p-2 text-white/20 hover:text-white transition-colors"
                title="ยกเลิก"
              >
                 <X size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-on-surface/30">
          <p className="font-bold">ไม่พบผู้เล่น</p>
        </div>
      )}
      </>)}
      {rankPickId && (() => {
        const m = members.find(x => x.id === rankPickId);
        return m ? <RankPickerModal title={`ระดับมือของ ${m.name}`} current={m.rank} onPick={r => { onUpdateRank(m.id, r); setRankPickId(null); }} onClose={() => setRankPickId(null)} /> : null;
      })()}
      {showBulkAvatar && onSaveProfile && (
        <BulkAvatarModal members={members} profiles={profiles} onClose={() => setShowBulkAvatar(false)}
          onSave={entries => entries.forEach(e => onSaveProfile(e.id, { ...(profiles[e.id] || {}), avatar: e.avatar }))} />
      )}
      {profileId && (
        <PlayerProfileModal playerId={profileId} members={members} gameHistory={gameHistory} sessionHistory={sessionHistory}
          profile={profiles[profileId]} onSaveProfile={onSaveProfile} onClose={() => setProfileId(null)} />
      )}
    </div>
  );
}
