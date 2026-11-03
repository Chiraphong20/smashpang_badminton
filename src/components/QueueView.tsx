import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { Court, RANK_COLORS, CourtQueueSlot, Member, Rank } from '../types';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

import { apiFetch } from '../lib/api';

interface AppState {
  members: Member[];
  courts: Court[];
  courtQueues?: Record<string, CourtQueueSlot[]>;
  groupName?: string;
}

export function QueueView() {
  const [state, setState] = useState<AppState | null>(null);
  const [now, setNow] = useState(new Date());
  const [lastSync, setLastSync] = useState(new Date());
  const [blocked, setBlocked] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    try {
      const res = await apiFetch('/queue');
      if (res.ok) {
        setState(await res.json());
        setLastSync(new Date());
      } else if (res.status === 403) {
        setBlocked((await res.json().catch(() => ({}))).message || 'ก๊วนนี้ไม่เปิดใช้หน้าคิวสาธารณะ');
      }
    } catch {}
  };

  useEffect(() => {
    load();
    const syncIv = setInterval(load, 20000);
    const clockIv = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(syncIv); clearInterval(clockIv); };
  }, []);

  if (!state && blocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <p className="font-bold text-on-surface/50 text-center">{blocked}</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto animate-pulse">
            <span className="text-4xl">🏸</span>
          </div>
          <p className="font-bold text-on-surface/40">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  const allCourts = state.courts || [];
  const members = state.members || [];
  const queues = state.courtQueues || {};
  const byId = (id?: string | null) => (id ? members.find(m => m.id === id) : undefined);
  const activeCount = allCourts.filter(c => c.status === 'active').length;

  // คนที่รอลงสนาม: เรียงเหมือนในแอป (ตีน้อยสุดก่อน แล้วมาก่อนก่อน)
  const waiting = members
    .filter(m => m.status === 'waiting')
    .sort((a, b) => (a.gamesPlayed !== b.gamesPlayed ? a.gamesPlayed - b.gamesPlayed : a.checkInTime - b.checkInTime));
  const q = search.trim().toLowerCase();
  const match = (name: string) => !!q && name.toLowerCase().includes(q);

  // ชื่อ → สนามที่ถูกจัดคิวไว้ให้ (ไว้ติดป้ายบนรายชื่อที่รอ)
  const queuedCourt = new Map<string, string>();
  allCourts.forEach(c => (queues[c.id] || []).forEach((slot, idx) => [...slot.teamA, ...slot.teamB].forEach(p => {
    const key = (p.memberId || p.name).toString();
    if (!queuedCourt.has(key)) queuedCourt.set(key, `${c.name}${idx > 0 ? ` (คิวที่ ${idx + 1})` : ''}`);
  })));

  const QueueChip = ({ p, hit }: { p: { name: string; rank: Rank }; hit: boolean }) => (
    <div className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-bold', RANK_COLORS[p.rank], hit && 'ring-2 ring-yellow-400')}>
      <span className="text-xs font-bold opacity-70">{p.rank}</span>
      <span>{p.name}</span>
    </div>
  );

  const Person = ({ name, rank, right }: { name: string; rank: Rank; right?: boolean }) => (
    <div className={cn('flex items-center gap-2', right && 'justify-end')}>
      {!right && <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0', RANK_COLORS[rank])}>{rank}</span>}
      <span className={cn('font-bold text-base truncate', match(name) && 'bg-yellow-200 rounded px-1')}>{name}</span>
      {right && <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0', RANK_COLORS[rank])}>{rank}</span>}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <div className="bg-primary text-white sticky top-0 z-10 shadow-xl shadow-primary/20">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏸</span>
            <div>
              <h1 className="font-headline font-black text-xl leading-none">{state.groupName || 'คิวแบดมินตัน'}</h1>
              <p className="text-xs text-white/50 mt-0.5">คิวสด · Live Queue Board</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-headline font-black text-2xl tabular-nums leading-none">{format(now, 'HH:mm')}</p>
            <p className="text-xs text-white/50">{format(now, 'น. d MMM', { locale: th })}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ค้นหาชื่อของฉัน เพื่อดูว่าจะได้ลงสนามไหน"
          className="w-full px-5 py-3.5 bg-white rounded-2xl border border-on-surface/10 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-primary/25" />

        {/* ทุกสนาม */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <h2 className="font-bold text-base text-on-surface">
              สนาม
              <span className="ml-2 text-on-surface/40 font-semibold text-sm">(กำลังตี {activeCount}/{allCourts.length} สนาม)</span>
            </h2>
          </div>

          {allCourts.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-on-surface/5">
              <p className="text-3xl mb-2">😴</p>
              <p className="font-bold text-on-surface/30">ยังไม่มีสนามในระบบ</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allCourts.map(court => {
                const players = court.players.map(byId).filter(Boolean) as Member[];
                const teamA = players.slice(0, 2);
                const teamB = players.slice(2);
                const isActive = court.status === 'active';
                const arranging = !isActive && players.length > 0;
                const nextSlots = queues[court.id] || [];

                return (
                  <div key={court.id} className={cn('bg-white rounded-3xl p-5 shadow-sm border', isActive ? 'border-green-200' : 'border-on-surface/5')}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-bold text-on-surface/60">{court.name}</span>
                      {isActive
                        ? <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold">🏸 กำลังตี{court.startTime ? ` · ${format(court.startTime, 'HH:mm')}` : ''}</span>
                        : arranging
                          ? <span className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-bold">⏳ กำลังจัดทีม</span>
                          : <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1 rounded-full font-bold">ว่าง</span>}
                    </div>

                    {players.length > 0 ? (
                      <div className="grid grid-cols-[1fr_32px_1fr] gap-2 items-center">
                        <div className="space-y-2">{teamA.map(p => <Person key={p.id} name={p.name} rank={p.rank} />)}</div>
                        <div className="text-center text-on-surface/20 font-black text-xs">VS</div>
                        <div className="space-y-2">{teamB.map(p => <Person key={p.id} name={p.name} rank={p.rank} right />)}</div>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-on-surface/30">สนามว่าง พร้อมให้ลงตี</p>
                    )}

                    {nextSlots.length > 0 && (
                      <div className="mt-4 -mx-5 -mb-5 rounded-b-3xl bg-primary/[0.04] border-t border-primary/10 px-5 pt-3 pb-4 space-y-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center text-sm">⏭</span>
                          <p className="text-sm font-black text-on-surface">คิวตีต่อไป</p>
                          <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-bold">{nextSlots.length}</span>
                        </div>
                        {nextSlots.slice(0, 4).map((slot, idx) => (
                          <div key={slot.id} className="bg-white rounded-2xl border border-on-surface/5 shadow-sm p-3 flex items-center gap-3">
                            <span className={cn('w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0', idx === 0 ? 'bg-primary text-white' : 'bg-on-surface/5 text-on-surface/40')}>{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                                <div className="flex flex-wrap gap-1.5">{slot.teamA.map((p, k) => <QueueChip key={k} p={p} hit={match(p.name)} />)}</div>
                                {slot.teamA.length > 0 && slot.teamB.length > 0 ? <span className="text-on-surface/25 font-black text-xs">VS</span> : <span />}
                                <div className="flex flex-wrap gap-1.5 justify-end">{slot.teamB.map((p, k) => <QueueChip key={k} p={p} hit={match(p.name)} />)}</div>
                              </div>
                              {slot.note && <p className="text-xs text-on-surface/40 font-semibold mt-1.5">{slot.note}</p>}
                            </div>
                          </div>
                        ))}
                        {nextSlots.length > 4 && <p className="text-xs font-bold text-on-surface/35 text-center">และอีก {nextSlots.length - 4} คิว</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* คนที่รอลงสนาม */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <h2 className="font-bold text-base text-on-surface">
              รอลงสนาม
              <span className="ml-2 text-on-surface/40 font-semibold text-sm">({waiting.length} คน)</span>
            </h2>
          </div>
          {waiting.length === 0 ? (
            <div className="bg-white rounded-3xl p-6 text-center border border-on-surface/5">
              <p className="font-bold text-on-surface/30">ยังไม่มีคนรอคิว</p>
            </div>
          ) : (
            <ol className="bg-white rounded-3xl border border-on-surface/5 divide-y divide-on-surface/5 overflow-hidden">
              {waiting.map((m, i) => {
                const court = queuedCourt.get(m.id) || queuedCourt.get(m.name);
                return (
                  <li key={m.id} className={cn('flex items-center gap-3 px-4 py-3', match(m.name) && 'bg-yellow-50')}>
                    <span className="w-7 text-center text-sm font-black text-on-surface/30">{i + 1}</span>
                    <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0', RANK_COLORS[m.rank])}>{m.rank}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate">{m.name}</p>
                      <p className="text-xs font-semibold text-on-surface/40">ตีไปแล้ว {m.gamesPlayed} เกม</p>
                    </div>
                    {court && <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-black shrink-0">→ {court}</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <p className="text-center text-xs text-on-surface/20 pb-6">
          อัปเดตทุก 20 วินาที · ล่าสุด {format(lastSync, 'HH:mm:ss')} น.
        </p>
      </div>
    </div>
  );
}
