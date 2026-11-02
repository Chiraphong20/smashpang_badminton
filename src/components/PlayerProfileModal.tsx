import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { X, Trophy, Flame, CalendarDays, Wallet, Users, Pencil, Camera, Phone, MessageCircle, StickyNote, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Member, GameRecord, SessionRecord, PlayerProfile, RANK_LEVEL_LABELS } from '../types';
import { Avatar } from './Avatar';
import { resizeToAvatar } from '../lib/image';

interface Props {
  playerId: string;
  members: Member[];
  gameHistory: GameRecord[];
  sessionHistory: SessionRecord[];
  profile?: PlayerProfile;
  /** ไม่ส่งมา = ดูอย่างเดียว (ซ่อนปุ่มแก้ไข) */
  onSaveProfile?: (id: string, profile: PlayerProfile) => void;
  onClose: () => void;
}

// โปรไฟล์ผู้เล่น — รวมสถิติทุกวันที่เคยตี (วันนี้ + ประวัติย้อนหลัง) ของคนเดียว
export function PlayerProfileModal({ playerId, members, gameHistory, sessionHistory, profile, onSaveProfile, onClose }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PlayerProfile>(profile || {});
  const [imgError, setImgError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const startEdit = () => { setDraft(profile || {}); setImgError(''); setEditing(true); };
  const save = () => {
    const clean: PlayerProfile = {};
    (['nickname', 'phone', 'lineId', 'note'] as const).forEach(k => { const v = (draft[k] || '').trim(); if (v) clean[k] = v; });
    if (draft.avatar) clean.avatar = draft.avatar;
    onSaveProfile?.(playerId, clean);
    setEditing(false);
  };
  const pickImage = async (f?: File) => {
    if (!f) return;
    setImgError('');
    try { const url = await resizeToAvatar(f); setDraft(d => ({ ...d, avatar: url })); }
    catch { setImgError('ใช้ไฟล์รูปภาพเท่านั้น'); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (editing) setEditing(false); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editing]);

  const p = useMemo(() => {
    const sources: { games: GameRecord[]; members: Member[]; played: boolean }[] = [
      { games: gameHistory, members, played: false },
      ...sessionHistory.map(s => ({ games: s.gameHistory, members: s.membersSnapshot || [], played: false })),
    ];
    let name = '';
    let rank: Member['rank'] | null = null;
    let spent = 0;
    let days = 0;
    const mine: { g: GameRecord; idx: number }[] = [];
    for (const src of sources) {
      const snap = src.members.find(m => m.id === playerId);
      if (snap) {
        name = snap.name;
        if (!rank) rank = snap.rank;
        spent += (snap.totalCourt || 0) + (snap.totalShuttle || 0) + (snap.totalSnack || 0);
      }
      const gs = src.games.filter(g => g.players.some(pl => pl.id === playerId));
      if (gs.length > 0) days++;
      gs.forEach(g => mine.push({ g, idx: g.players.findIndex(pl => pl.id === playerId) }));
    }
    mine.sort((a, b) => b.g.playedAt - a.g.playedAt);
    if (!name) name = mine[0]?.g.players[mine[0].idx]?.name ?? '';
    if (!rank) rank = mine[0]?.g.players[mine[0].idx]?.rank ?? null;

    let wins = 0, losses = 0, draws = 0, scored = 0, pf = 0, pa = 0;
    const partners = new Map<string, { name: string; games: number; wins: number }>();
    const results: ('W' | 'L' | 'D' | null)[] = [];
    for (const { g, idx } of mine) {
      const hasScore = typeof g.scoreA === 'number' && typeof g.scoreB === 'number';
      const myTeam = idx < 2 ? 0 : 1;
      const partner = g.players.find((pl, i) => i !== idx && (i < 2 ? 0 : 1) === myTeam);
      let res: 'W' | 'L' | 'D' | null = null;
      if (hasScore) {
        const m = myTeam === 0 ? g.scoreA! : g.scoreB!;
        const t = myTeam === 0 ? g.scoreB! : g.scoreA!;
        scored++; pf += m; pa += t;
        if (m > t) { wins++; res = 'W'; } else if (m < t) { losses++; res = 'L'; } else { draws++; res = 'D'; }
      }
      results.push(res);
      if (partner) {
        const x = partners.get(partner.id) || { name: partner.name, games: 0, wins: 0 };
        x.games++; if (res === 'W') x.wins++;
        partners.set(partner.id, x);
      }
    }
    // ชนะติดต่อกันล่าสุด (นับเฉพาะเกมที่มีคะแนน)
    let streak = 0;
    for (const r of results.filter(Boolean)) { if (r === 'W') streak++; else break; }

    return {
      name, rank, spent, days, games: mine.length, wins, losses, draws, scored, pf, pa, streak,
      topPartners: [...partners.values()].sort((a, b) => b.games - a.games).slice(0, 3),
      recent: mine.slice(0, 8),
      results: results.slice(0, 10),
    };
  }, [playerId, members, gameHistory, sessionHistory]);

  const winRate = p.scored ? Math.round((p.wins / p.scored) * 100) : null;
  const stat = 'rounded-2xl bg-background p-3 text-center';

  return (
    <div className="fixed inset-0 z-[400] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="relative p-5 sm:p-6 bg-primary text-on-primary rounded-t-[2rem]">
          <button onClick={onClose} className="absolute right-4 top-4 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center" aria-label="ปิด"><X size={18} /></button>
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <Avatar name={p.name || '?'} profile={editing ? draft : profile} className="w-20 h-20 ring-4 ring-white/30" textClass="text-3xl !bg-white/20 !text-white" />
              {editing && (
                <button onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white text-primary shadow flex items-center justify-center" aria-label="เปลี่ยนรูป"><Camera size={16} /></button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { pickImage(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            <div className="min-w-0 pr-10">
              <h3 className="font-headline font-black text-2xl truncate">{p.name || 'ไม่พบผู้เล่น'}</h3>
              {!editing && profile?.nickname && <p className="text-sm font-bold opacity-90">“{profile.nickname}”</p>}
              {p.rank && (
                <p className="text-sm font-bold opacity-85">
                  ระดับ {p.rank}{RANK_LEVEL_LABELS[p.rank] ? ` · ${RANK_LEVEL_LABELS[p.rank]}` : ''}
                </p>
              )}
              {onSaveProfile && !editing && (
                <button onClick={startEdit} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 hover:bg-white/30 text-xs font-black"><Pencil size={13} /> แก้ไขโปรไฟล์</button>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {editing ? (
            <div className="space-y-3 rounded-2xl bg-background p-4">
              <p className="text-sm font-black">แก้ไขโปรไฟล์</p>
              {imgError && <p className="text-xs font-bold text-red-500">{imgError}</p>}
              {draft.avatar && <button onClick={() => setDraft(d => { const { avatar, ...rest } = d; return rest; })} className="flex items-center gap-1.5 text-xs font-bold text-red-500"><Trash2 size={13} /> ลบรูปโปรไฟล์</button>}
              {([['nickname', 'ชื่อเล่น', 'เช่น เบส', 30], ['phone', 'เบอร์โทร', '08x-xxx-xxxx', 30], ['lineId', 'LINE ID', 'เช่น bass_badminton', 40]] as const).map(([k, label, ph, max]) => (
                <label key={k} className="block space-y-1">
                  <span className="text-xs font-bold text-on-surface/50">{label}</span>
                  <input value={draft[k] || ''} maxLength={max} placeholder={ph} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-on-surface/10 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-primary/25" />
                </label>
              ))}
              <label className="block space-y-1">
                <span className="text-xs font-bold text-on-surface/50">หมายเหตุ</span>
                <textarea value={draft.note || ''} maxLength={300} rows={3} placeholder="เช่น ถนัดซ้าย / ชอบตีคู่ / แพ้ลูกตบ"
                  onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-on-surface/10 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 resize-none" />
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditing(false)} className="flex-1 py-2.5 rounded-xl bg-white font-black text-sm text-on-surface/60">ยกเลิก</button>
                <button onClick={save} className="flex-[2] py-2.5 rounded-xl bg-primary text-white font-black text-sm">บันทึกโปรไฟล์</button>
              </div>
            </div>
          ) : (profile?.phone || profile?.lineId || profile?.note) && (
            <div className="space-y-2 rounded-2xl bg-background p-4 text-sm">
              {profile?.phone && <a href={`tel:${profile.phone}`} className="flex items-center gap-2.5 font-bold hover:text-primary"><Phone size={15} className="text-on-surface/40" /> {profile.phone}</a>}
              {profile?.lineId && <p className="flex items-center gap-2.5 font-bold"><MessageCircle size={15} className="text-on-surface/40" /> LINE: {profile.lineId}</p>}
              {profile?.note && <p className="flex items-start gap-2.5 font-semibold text-on-surface/70"><StickyNote size={15} className="text-on-surface/40 mt-0.5 shrink-0" /> <span className="whitespace-pre-line">{profile.note}</span></p>}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2.5">
            <div className={stat}><p className="font-headline font-black text-2xl">{p.games}</p><p className="text-[11px] font-bold text-on-surface/50">เกมที่ตี</p></div>
            <div className={stat}><p className="font-headline font-black text-2xl">{p.days}</p><p className="text-[11px] font-bold text-on-surface/50 flex items-center justify-center gap-1"><CalendarDays size={11} /> วันที่มาตี</p></div>
            <div className={stat}><p className="font-headline font-black text-2xl">฿{p.spent}</p><p className="text-[11px] font-bold text-on-surface/50 flex items-center justify-center gap-1"><Wallet size={11} /> จ่ายรวม</p></div>
            <div className={stat}><p className="font-headline font-black text-2xl text-emerald-600">{p.wins}</p><p className="text-[11px] font-bold text-on-surface/50 flex items-center justify-center gap-1"><Trophy size={11} /> ชนะ</p></div>
            <div className={stat}><p className="font-headline font-black text-2xl text-red-500">{p.losses}</p><p className="text-[11px] font-bold text-on-surface/50">แพ้{p.draws ? ` · เสมอ ${p.draws}` : ''}</p></div>
            <div className={stat}><p className="font-headline font-black text-2xl">{winRate !== null ? `${winRate}%` : '—'}</p><p className="text-[11px] font-bold text-on-surface/50">อัตราชนะ</p></div>
          </div>

          {p.streak >= 2 && (
            <div className="flex items-center justify-center gap-1.5 rounded-2xl bg-orange-50 border border-orange-100 px-4 py-3 text-sm text-orange-600 font-black"><Flame size={16} /> ชนะติดต่อกัน {p.streak} เกม</div>
          )}

          {p.results.some(Boolean) && (
            <div className="space-y-1.5">
              <p className="text-xs font-black text-on-surface/45">ผลล่าสุด (ใหม่ → เก่า)</p>
              <div className="flex gap-1.5 flex-wrap">
                {p.results.map((r, i) => (
                  <span key={i} className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black',
                    r === 'W' ? 'bg-emerald-100 text-emerald-700' : r === 'L' ? 'bg-red-100 text-red-600' : r === 'D' ? 'bg-slate-100 text-slate-600' : 'bg-background text-on-surface/25')}>
                    {r === 'W' ? 'ช' : r === 'L' ? 'พ' : r === 'D' ? 'ส' : '–'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {p.topPartners.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-black text-on-surface/45 flex items-center gap-1.5"><Users size={13} /> คู่หูที่ตีด้วยบ่อยสุด</p>
              {p.topPartners.map(t => (
                <div key={t.name} className="flex items-center justify-between rounded-xl bg-background px-4 py-2.5 text-sm">
                  <span className="font-bold truncate">{t.name}</span>
                  <span className="font-bold text-on-surface/55 shrink-0">{t.games} เกม{t.wins ? ` · ชนะ ${t.wins}` : ''}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-black text-on-surface/45">เกมล่าสุด</p>
            {p.recent.length === 0 ? (
              <p className="text-sm text-on-surface/35 text-center py-4">ยังไม่มีเกม</p>
            ) : p.recent.map(({ g, idx }) => {
              const myTeam = idx < 2 ? 0 : 1;
              const mates = g.players.filter((_, i) => (i < 2 ? 0 : 1) === myTeam).map(x => x.name).join(' & ');
              const opp = g.players.filter((_, i) => (i < 2 ? 0 : 1) !== myTeam).map(x => x.name).join(' & ');
              const has = typeof g.scoreA === 'number' && typeof g.scoreB === 'number';
              const my = has ? (myTeam === 0 ? g.scoreA! : g.scoreB!) : 0;
              const th = has ? (myTeam === 0 ? g.scoreB! : g.scoreA!) : 0;
              return (
                <div key={g.id} className="flex items-center gap-3 rounded-xl border border-on-surface/8 px-3 py-2.5 text-xs sm:text-sm">
                  <span className="text-[11px] text-on-surface/40 w-20 shrink-0">{format(g.playedAt, 'dd/MM HH:mm')}</span>
                  <div className="flex-1 min-w-0 leading-snug">
                    <p className="font-bold truncate">{mates}</p>
                    <p className="text-on-surface/50 truncate">vs {opp}</p>
                  </div>
                  {has && <span className={cn('text-xs font-black px-2.5 py-1 rounded-full shrink-0', my > th ? 'bg-emerald-100 text-emerald-700' : my < th ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600')}>{my > th ? 'ชนะ' : my < th ? 'แพ้' : 'เสมอ'}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
