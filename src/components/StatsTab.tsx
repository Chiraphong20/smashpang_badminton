import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { BarChart3, Trophy, Wallet, Swords, Calculator, CalendarRange, Layers, ListOrdered } from 'lucide-react';
import { cn } from '../lib/utils';
import { PlayerProfileModal } from './PlayerProfileModal';
import { Avatar } from './Avatar';
import { assignTiers, rangeFor, Tier } from '../lib/ranking';
import { Member, GameRecord, SessionRecord, PaymentRecord, SessionMode, ModeConfig, PlayerProfile, MODE_LABELS, MODE_THEME } from '../types';

interface Props {
  members: Member[];
  gameHistory: GameRecord[];
  sessionHistory: SessionRecord[];
  paymentHistory: PaymentRecord[];
  sessionStartDate: number | null;
  mode: SessionMode;
  modeConfig: ModeConfig;
  onApplySplit: () => void;
  onChangeConfig: (patch: Partial<ModeConfig>) => void;
  profiles?: Record<string, PlayerProfile>;
  onSaveProfile?: (id: string, profile: PlayerProfile) => void;
}

interface Row {
  key: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  scored: number; // จำนวนเกมที่บันทึกผล
  days: number;   // จำนวนวันที่มาตี
  spent: number;
}

type Metric = 'games' | 'wins' | 'rate' | 'days' | 'spent';
const METRICS: [Metric, string][] = [['games', 'จำนวนแมตซ์'], ['wins', 'ชนะ'], ['rate', 'อัตราชนะ'], ['days', 'มาตีบ่อย (วัน)'], ['spent', 'เงิน']];
const MIN_SCORED_FOR_RATE = 3;

const TIER_STYLE: Record<Tier, { badge: string; row: string; label: string }> = {
  S: { badge: 'bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950', row: 'bg-amber-50 border-amber-200', label: 'Top 15%' },
  A: { badge: 'bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950', row: 'bg-orange-50 border-orange-200', label: 'ถึง 40%' },
  B: { badge: 'bg-gradient-to-br from-sky-300 to-sky-500 text-sky-950', row: 'bg-sky-50 border-sky-200', label: 'ถึง 75%' },
  C: { badge: 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800', row: 'bg-slate-50 border-slate-200', label: 'ที่เหลือ' },
};

export function StatsTab({ members, gameHistory, sessionHistory, paymentHistory, sessionStartDate, mode, modeConfig, onApplySplit, onChangeConfig, profiles = {}, onSaveProfile }: Props) {
  const [period, setPeriod] = useState<string>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'rank' | 'tier'>('rank');
  // กรองประวัติย้อนหลังตามโหมด (เซสชันเก่าที่ไม่มีโหมดบันทึกไว้ นับเป็น "คิดตามเกม")
  const [modeFilter, setModeFilter] = useState<SessionMode | 'all'>('all');
  const modeOf = (s: SessionRecord): SessionMode => s.mode ?? 'perGame';
  const [metric, setMetric] = useState<Metric>(mode === 'fun' ? 'wins' : 'games');

  const isToday = period === 'today';
  const range = useMemo(() => rangeFor(period, from, to), [period, from, to]);

  // ทุกแหล่งข้อมูล: วันนี้ + เซสชันย้อนหลัง
  const sources = useMemo(() => [
    { id: 'today', games: gameHistory, members, mode, at: sessionStartDate ?? Date.now() },
    ...sessionHistory.map(s => ({ id: s.id, games: s.gameHistory, members: s.membersSnapshot || [], mode: modeOf(s), at: s.date })),
  ], [gameHistory, members, mode, sessionStartDate, sessionHistory]);

  // เดือนที่มีข้อมูล (ให้เลือกดูย้อนหลัง)
  const monthsAvailable = useMemo(() => {
    const set = new Set<string>();
    for (const s of sources) for (const g of s.games) set.add(format(g.playedAt, 'yyyy-MM'));
    return [...set].sort().reverse();
  }, [sources]);

  // ชุดข้อมูล (เกม + ยอดเงิน + ชื่อ) ตามช่วงเวลา/โหมดที่เลือก
  const { games, spendByKey, nameByKey } = useMemo(() => {
    const spend = new Map<string, number>();
    const names = new Map<string, string>();
    const all: GameRecord[] = [];
    for (const src of sources) {
      if (modeFilter !== 'all' && src.mode !== modeFilter) continue;
      if (isToday && src.id !== 'today') continue;
      const inRange = (t: number) => !range || (t >= range.start && t <= range.end);
      const gs = isToday ? src.games : src.games.filter(g => inRange(g.playedAt));
      all.push(...gs);
      const countSpend = isToday ? true : inRange(src.at);
      for (const m of src.members) {
        names.set(m.id, m.name);
        if (countSpend) spend.set(m.id, (spend.get(m.id) || 0) + (m.totalCourt || 0) + (m.totalShuttle || 0) + (m.totalSnack || 0));
      }
    }
    return { games: all, spendByKey: spend, nameByKey: names };
  }, [sources, modeFilter, isToday, range]);

  const rows = useMemo(() => {
    const map = new Map<string, Row & { dates: Set<string> }>();
    const get = (key: string, name: string) => {
      let r = map.get(key);
      if (!r) { r = { key, name, games: 0, wins: 0, losses: 0, draws: 0, scored: 0, days: 0, spent: 0, dates: new Set() }; map.set(key, r); }
      return r;
    };
    for (const g of games) {
      const hasScore = typeof g.scoreA === 'number' && typeof g.scoreB === 'number';
      const day = format(g.playedAt, 'yyyy-MM-dd');
      g.players.forEach((p, i) => {
        const r = get(p.id, p.name);
        r.games++;
        r.dates.add(day);
        if (!hasScore) return;
        const mine = i < 2 ? g.scoreA! : g.scoreB!;
        const theirs = i < 2 ? g.scoreB! : g.scoreA!;
        r.scored++;
        if (mine > theirs) r.wins++;
        else if (mine < theirs) r.losses++;
        else r.draws++;
      });
    }
    // คนที่เช็กอินแต่ยังไม่ได้ตี ก็ให้เห็นในตาราง (สำคัญกับบุฟเฟต์ — จะได้เห็นว่าใครยังไม่ได้ตีเลย)
    if (isToday) members.forEach(m => get(m.id, m.name));
    map.forEach(r => { r.spent = spendByKey.get(r.key) || 0; r.name = nameByKey.get(r.key) || r.name; r.days = r.dates.size; });
    return [...map.values()];
  }, [games, members, isToday, spendByKey, nameByKey]);

  const valueOf = (r: Row): number =>
    metric === 'wins' ? r.wins
      : metric === 'spent' ? r.spent
        : metric === 'days' ? r.days
          : metric === 'rate' ? (r.scored >= MIN_SCORED_FOR_RATE ? r.wins / r.scored : -1)
            : r.games;

  const sorted = useMemo(() => [...rows].sort((a, b) => valueOf(b) - valueOf(a) || b.games - a.games || a.name.localeCompare(b.name, 'th')), [rows, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const tiers = useMemo(() => assignTiers(sorted, valueOf), [sorted, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const metricText = (r: Row) =>
    metric === 'wins' ? `${r.wins} ชนะ`
      : metric === 'spent' ? `฿${r.spent}`
        : metric === 'days' ? `${r.days} วัน`
          : metric === 'rate' ? (r.scored >= MIN_SCORED_FOR_RATE ? `${Math.round((r.wins / r.scored) * 100)}%` : '—')
            : `${r.games} แมตซ์`;

  const podium = sorted.filter(r => valueOf(r) > 0).slice(0, 3);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const totalPaid = isToday ? paymentHistory.reduce((s, p) => s + p.amount, 0) : null;
  const playersWithGames = rows.filter(r => r.games > 0);
  const avgGames = playersWithGames.length ? games.reduce((s, g) => s + g.players.length, 0) / (isToday ? Math.max(1, members.filter(m => m.status !== 'away').length) : playersWithGames.length) : 0;
  const maxGames = Math.max(1, ...rows.map(r => r.games));
  const scoredGames = games.filter(g => typeof g.scoreA === 'number').length;

  // หารเท่า
  const splitPlayers = members.filter(m => m.gamesPlayed > 0).length;
  const splitTotal = modeConfig.splitCourtTotal + modeConfig.splitShuttleTotal;
  const splitShare = splitPlayers ? Math.ceil(modeConfig.splitCourtTotal / splitPlayers) + Math.ceil(modeConfig.splitShuttleTotal / splitPlayers) : 0;
  const splitDone = !!modeConfig.splitApplied && Object.keys(modeConfig.splitApplied).length > 0;

  const periodLabel = isToday ? `วันนี้${sessionStartDate ? ' · ' + format(sessionStartDate, 'dd/MM/yyyy') : ''}`
    : period === 'all' ? 'ทุกช่วงเวลา'
      : period === 'thisMonth' ? 'เดือนนี้'
        : period === 'lastMonth' ? 'เดือนที่แล้ว'
          : period === 'last30' ? '30 วันล่าสุด'
            : period.startsWith('m:') ? format(new Date(period.slice(2) + '-01T00:00:00'), 'MMMM yyyy', { locale: th })
              : `${from ? format(new Date(from + 'T00:00:00'), 'dd/MM/yyyy') : 'เริ่มต้น'} – ${to ? format(new Date(to + 'T00:00:00'), 'dd/MM/yyyy') : 'ปัจจุบัน'}`;

  const card = 'bg-white rounded-3xl p-5 shadow-sm border border-on-surface/5';
  const chip = (on: boolean) => cn('px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors', on ? 'bg-primary text-white shadow-sm' : 'bg-white text-on-surface/60 hover:bg-on-surface/5');
  const dateInput = 'px-3 py-2 rounded-xl bg-white border border-on-surface/10 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';
  const dispName = (r: Row) => profiles[r.key]?.nickname ? `${r.name}` : r.name;
  const nick = (r: Row) => profiles[r.key]?.nickname;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
          <BarChart3 size={24} className="text-primary" />
        </div>
        <div className="flex-1 min-w-[10rem]">
          <h2 className="font-headline font-black text-2xl text-on-surface">สถิติและอันดับ</h2>
          <p className="text-xs text-on-surface/40 font-bold">ดู: {periodLabel} · โหมดปัจจุบัน: {MODE_LABELS[mode]} · กดที่ชื่อเพื่อดูโปรไฟล์</p>
        </div>
      </div>

      {/* ช่วงเวลา */}
      <section className={cn(card, 'space-y-3')}>
        <p className="text-xs font-black text-on-surface/45 flex items-center gap-1.5"><CalendarRange size={14} /> ช่วงเวลา</p>
        <div className="flex flex-wrap gap-2">
          {([['today', 'วันนี้'], ['thisMonth', 'เดือนนี้'], ['lastMonth', 'เดือนที่แล้ว'], ['last30', '30 วันล่าสุด'], ['all', 'ทั้งหมด'], ['custom', 'กำหนดเอง']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} className={chip(period === k)}>{l}</button>
          ))}
          <select value={period.startsWith('m:') ? period : ''} onChange={e => e.target.value && setPeriod(e.target.value)}
            className={cn(dateInput, period.startsWith('m:') && 'border-primary text-primary')}>
            <option value="">เลือกเดือน…</option>
            {monthsAvailable.map(mk => <option key={mk} value={`m:${mk}`}>{format(new Date(mk + '-01T00:00:00'), 'MMMM yyyy', { locale: th })}</option>)}
          </select>
        </div>
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-on-surface/55">ตั้งแต่วันที่</span>
            <input type="date" className={dateInput} value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />
            <span className="text-sm font-bold text-on-surface/55">ถึงวันที่</span>
            <input type="date" className={dateInput} value={to} min={from || undefined} onChange={e => setTo(e.target.value)} />
            {(from || to) && <button onClick={() => { setFrom(''); setTo(''); }} className="text-xs font-bold text-on-surface/45 hover:text-on-surface px-2">ล้าง</button>}
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={() => setModeFilter('all')}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-bold', modeFilter === 'all' ? 'bg-on-surface text-white' : 'bg-background text-on-surface/60')}>ทุกโหมด</button>
          {(Object.keys(MODE_LABELS) as SessionMode[]).map(m => (
            <button key={m} onClick={() => setModeFilter(m)}
              style={{ backgroundColor: modeFilter === m ? MODE_THEME[m].color : MODE_THEME[m].soft, color: modeFilter === m ? '#fff' : MODE_THEME[m].color }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold">{MODE_THEME[m].emoji} {MODE_LABELS[m]}</button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={card}><p className="text-xs font-bold text-on-surface/40">แมตซ์ที่ตี</p><p className="font-headline font-black text-3xl">{games.length}</p></div>
        <div className={card}><p className="text-xs font-bold text-on-surface/40">ผู้เล่น</p><p className="font-headline font-black text-3xl">{playersWithGames.length}</p></div>
        <div className={card}><p className="text-xs font-bold text-on-surface/40">แมตซ์ที่บันทึกผล</p><p className="font-headline font-black text-3xl">{scoredGames}</p></div>
        <div className={card}>
          <p className="text-xs font-bold text-on-surface/40">ยอดเงินรวม{totalPaid !== null ? ` (จ่ายแล้ว ฿${totalPaid})` : ''}</p>
          <p className="font-headline font-black text-3xl">฿{totalSpent}</p>
        </div>
      </div>

      {isToday && mode === 'split' && (
        <section className={cn(card, 'space-y-3')}>
          <h3 className="text-sm font-black text-on-surface/50 flex items-center gap-2"><Calculator size={16} className="text-primary" /> หารเท่า</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {([['splitCourtTotal', 'ค่าเช่าสนามรวม (฿)'], ['splitShuttleTotal', 'ค่าลูกรวม (฿)']] as const).map(([key, label]) => (
              <label key={key} className="block space-y-1">
                <span className="text-xs font-bold text-on-surface/40 ml-1">{label}</span>
                <input type="number" inputMode="decimal" min={0} value={modeConfig[key] || ''} placeholder="0"
                  onChange={e => onChangeConfig({ [key]: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-full px-5 py-3 bg-background rounded-2xl font-headline font-black text-2xl focus:outline-none focus:ring-4 focus:ring-primary/15 border-none" />
              </label>
            ))}
          </div>
          <p className="text-sm">
            รวม <b>฿{splitTotal}</b> ÷ {splitPlayers} คน = <b className="text-primary text-lg">฿{splitShare}/คน</b>
          </p>
          <button onClick={onApplySplit} disabled={!splitPlayers || !splitTotal}
            className="px-5 py-3 bg-primary text-white rounded-xl font-bold text-sm disabled:opacity-40">
            {splitDone ? 'คำนวณและเรียกเก็บใหม่' : 'เรียกเก็บเข้าบิลทุกคน'}
          </button>
          {splitDone && <p className="text-xs text-on-surface/40">เรียกเก็บแล้ว — กดซ้ำได้ ระบบจะปรับยอดเดิมให้ (เช่นมีคนมาเพิ่ม)</p>}
        </section>
      )}

      {/* เลือกวิธีจัดอันดับ + มุมมอง */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-on-surface/5">
          <button onClick={() => setViewMode('rank')} className={cn('flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black', viewMode === 'rank' ? 'bg-primary text-white' : 'text-on-surface/55')}><ListOrdered size={15} /> อันดับ</button>
          <button onClick={() => setViewMode('tier')} className={cn('flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black', viewMode === 'tier' ? 'bg-primary text-white' : 'text-on-surface/55')}><Layers size={15} /> Tier</button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-bold text-on-surface/40">{viewMode === 'tier' ? 'จัด Tier ตาม' : 'เรียงตาม'}</span>
          {METRICS.map(([k, l]) => (
            <button key={k} onClick={() => setMetric(k)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-bold', metric === k ? 'bg-on-surface text-white' : 'bg-white text-on-surface/60')}>{l}</button>
          ))}
        </div>
      </div>
      {metric === 'rate' && <p className="text-xs font-semibold text-on-surface/45 -mt-3">อัตราชนะนับเฉพาะคนที่แมตซ์บันทึกผลอย่างน้อย {MIN_SCORED_FOR_RATE} แมตซ์ (เปิด "ถามผลทุกครั้งที่จบเกม" ในหน้าตั้งค่า)</p>}

      {viewMode === 'tier' ? (
        <section className="space-y-3">
          {(['S', 'A', 'B', 'C'] as Tier[]).map(t => {
            const list = sorted.filter(r => tiers.get(r) === t);
            const st = TIER_STYLE[t];
            return (
              <div key={t} className={cn('rounded-3xl border-2 p-4 flex gap-4 items-start', st.row)}>
                <div className="shrink-0 text-center">
                  <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center font-headline font-black text-4xl shadow-md', st.badge)}>{t}</div>
                  <p className="text-[11px] font-bold text-on-surface/45 mt-1.5">{st.label}</p>
                </div>
                <div className="flex-1 min-w-0 flex flex-wrap gap-2.5 py-1">
                  {list.length === 0 && <p className="text-sm font-semibold text-on-surface/30 py-4">ยังไม่มีผู้เล่นใน Tier นี้</p>}
                  {list.map(r => (
                    <button key={r.key} onClick={() => setProfileId(r.key)}
                      className="flex items-center gap-2.5 bg-white rounded-2xl pl-1.5 pr-4 py-1.5 shadow-sm border border-on-surface/5 hover:-translate-y-0.5 hover:shadow-md transition-all">
                      <Avatar name={r.name} profile={profiles[r.key]} className="w-10 h-10" textClass="text-base" />
                      <span className="text-left leading-tight">
                        <span className="block font-headline font-black text-sm">{dispName(r)}</span>
                        <span className="block text-[11px] font-bold text-on-surface/45">{nick(r) ? `“${nick(r)}” · ` : ''}{metricText(r)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="text-xs font-semibold text-on-surface/40">Tier จัดตามอันดับในช่วงเวลาที่เลือก: S = 15% แรก · A = ถึง 40% · B = ถึง 75% · ที่เหลือ C (คนที่ค่าเท่ากันอยู่ Tier เดียวกัน · คนที่ยังไม่มีข้อมูลไม่ถูกจัด Tier)</p>
        </section>
      ) : (
        <>
          {podium.length > 0 && (
            <section className="grid grid-cols-3 gap-2 sm:gap-4 items-end">
              {[podium[1], podium[0], podium[2]].map((r, col) => {
                if (!r) return <div key={col} />;
                const place = r === podium[0] ? 1 : r === podium[1] ? 2 : 3;
                return (
                  <button key={r.key} onClick={() => setProfileId(r.key)}
                    className={cn('rounded-3xl bg-white border-2 shadow-sm px-2 sm:px-4 text-center transition-all hover:-translate-y-1 hover:shadow-lg flex flex-col items-center',
                      place === 1 ? 'pt-6 pb-5 border-amber-300 bg-amber-50' : place === 2 ? 'pt-4 pb-4 border-slate-200' : 'pt-4 pb-4 border-orange-200')}>
                    <div className="text-3xl sm:text-4xl leading-none">{place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉'}</div>
                    <Avatar name={r.name} profile={profiles[r.key]} className="w-12 h-12 sm:w-14 sm:h-14 mt-2" textClass="text-xl" />
                    <p className="font-headline font-black text-sm sm:text-lg truncate mt-1 max-w-full">{dispName(r)}</p>
                    {nick(r) && <p className="text-[11px] font-semibold text-on-surface/45 truncate max-w-full">“{nick(r)}”</p>}
                    <p className="text-xs sm:text-sm font-bold text-primary">{metricText(r)}</p>
                  </button>
                );
              })}
            </section>
          )}

          <section className={cn(card, 'overflow-x-auto p-0')}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-on-surface/40 border-b border-on-surface/5">
                  <th className="p-3 w-10">#</th>
                  <th className="p-3">ชื่อ</th>
                  <th className="p-3 text-center">Tier</th>
                  <th className="p-3 min-w-[9rem]">แมตซ์{mode === 'buffet' && isToday ? ` (เฉลี่ย ${avgGames.toFixed(1)})` : ''}</th>
                  <th className="p-3 text-center">วัน</th>
                  <th className="p-3 text-center"><Trophy size={14} className="inline" /> ชนะ</th>
                  <th className="p-3 text-center">แพ้</th>
                  <th className="p-3 text-center">เสมอ</th>
                  <th className="p-3 text-center">%ชนะ</th>
                  <th className="p-3 text-right"><Wallet size={14} className="inline" /> เงิน</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr><td colSpan={10} className="p-8 text-center text-on-surface/30">ยังไม่มีข้อมูลในช่วงเวลานี้</td></tr>
                )}
                {sorted.map((r, i) => {
                  const behind = mode === 'buffet' && isToday && r.games < avgGames - 0.5;
                  const t = tiers.get(r);
                  return (
                    <tr key={r.key} onClick={() => setProfileId(r.key)} className="border-b border-on-surface/5 last:border-0 cursor-pointer hover:bg-primary/5 transition-colors">
                      <td className="p-3 font-black text-on-surface/40">{i + 1}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={r.name} profile={profiles[r.key]} className="w-8 h-8" textClass="text-xs" />
                          <span className="font-bold underline-offset-2 hover:underline">{dispName(r)}{nick(r) && <span className="ml-1.5 text-xs font-semibold text-on-surface/40">“{nick(r)}”</span>}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center">{t ? <span className={cn('inline-flex w-7 h-7 rounded-lg items-center justify-center font-headline font-black text-sm', TIER_STYLE[t].badge)}>{t}</span> : <span className="text-on-surface/20">—</span>}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full', behind ? 'bg-amber-400' : 'bg-primary')} style={{ width: `${(r.games / maxGames) * 100}%` }} />
                          </div>
                          <span className="font-bold w-6 text-right">{r.games}</span>
                        </div>
                        {behind && <p className="text-[10px] font-bold text-amber-500">ควรได้ตีเพิ่ม</p>}
                      </td>
                      <td className="p-3 text-center text-on-surface/60 font-bold">{r.days}</td>
                      <td className="p-3 text-center font-bold text-emerald-600">{r.wins}</td>
                      <td className="p-3 text-center font-bold text-red-500">{r.losses}</td>
                      <td className="p-3 text-center text-on-surface/50">{r.draws}</td>
                      <td className="p-3 text-center">{r.scored ? Math.round((r.wins / r.scored) * 100) + '%' : '—'}</td>
                      <td className="p-3 text-right font-bold">฿{r.spent}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      {games.length > 0 && (
        <section className={cn(card, 'space-y-2')}>
          <h3 className="text-sm font-black text-on-surface/50 flex items-center gap-2"><Swords size={16} className="text-primary" /> แมตซ์ล่าสุด</h3>
          {[...games].sort((a, b) => b.playedAt - a.playedAt).slice(0, 15).map(g => (
            <div key={g.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-on-surface/5 last:border-0">
              <span className="text-xs text-on-surface/40 w-24 shrink-0">{format(g.playedAt, 'dd/MM HH:mm')}</span>
              <span className={cn('flex-1 truncate', typeof g.scoreA === 'number' && g.scoreA > g.scoreB! && 'font-black text-emerald-700')}>{typeof g.scoreA === 'number' && g.scoreA > g.scoreB! ? '🏆 ' : ''}{g.players.slice(0, 2).map(p => p.name).join(' & ')}</span>
              <span className="font-headline font-black text-xs text-on-surface/50 shrink-0">{typeof g.scoreA !== 'number' ? 'vs' : g.scoreA === g.scoreB ? 'เสมอ' : 'ชนะ'}</span>
              <span className={cn('flex-1 truncate text-right', typeof g.scoreA === 'number' && g.scoreB! > g.scoreA && 'font-black text-emerald-700')}>{g.players.slice(2, 4).map(p => p.name).join(' & ')}{typeof g.scoreA === 'number' && g.scoreB! > g.scoreA ? ' 🏆' : ''}</span>
            </div>
          ))}
        </section>
      )}
      {profileId && (
        <PlayerProfileModal playerId={profileId} members={members} gameHistory={gameHistory} sessionHistory={sessionHistory}
          profile={profiles[profileId]} onSaveProfile={onSaveProfile} onClose={() => setProfileId(null)} />
      )}
    </div>
  );
}
