import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { BarChart3, Trophy, Wallet, Swords, Calculator } from 'lucide-react';
import { cn } from '../lib/utils';
import { PlayerProfileModal } from './PlayerProfileModal';
import { Member, GameRecord, SessionRecord, PaymentRecord, SessionMode, ModeConfig, MODE_LABELS, MODE_THEME } from '../types';

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
}

interface Row {
  key: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  scored: number; // จำนวนเกมที่มีคะแนน
  pointsFor: number;
  pointsAgainst: number;
  spent: number;
}

const TODAY = 'today';
const ALL = 'all';

export function StatsTab({ members, gameHistory, sessionHistory, paymentHistory, sessionStartDate, mode, modeConfig, onApplySplit, onChangeConfig }: Props) {
  const [view, setView] = useState<string>(TODAY);
  const [profileId, setProfileId] = useState<string | null>(null);
  // กรองประวัติย้อนหลังตามโหมด (เซสชันเก่าที่ไม่มีโหมดบันทึกไว้ นับเป็น "คิดตามเกม")
  const [modeFilter, setModeFilter] = useState<SessionMode | 'all'>('all');
  const modeOf = (s: SessionRecord): SessionMode => s.mode ?? 'perGame';
  const sessions = useMemo(() => sessionHistory.filter(s => modeFilter === 'all' || modeOf(s) === modeFilter), [sessionHistory, modeFilter]);
  const todayVisible = modeFilter === 'all' || modeFilter === mode;
  const [sortBy, setSortBy] = useState<'wins' | 'games' | 'spent'>(mode === 'fun' ? 'wins' : 'games');

  // ชุดข้อมูล (เกม + ยอดเงินรายคน) ตามช่วงที่เลือก
  const { games, spendByKey, nameByKey } = useMemo(() => {
    const sources: { games: GameRecord[]; members: Member[] }[] = [];
    if (view === TODAY || (view === ALL && todayVisible)) sources.push({ games: gameHistory, members });
    if (view === ALL) sessions.forEach(s => sources.push({ games: s.gameHistory, members: s.membersSnapshot || [] }));
    else if (view !== TODAY) {
      const s = sessions.find(x => x.id === view);
      if (s) sources.push({ games: s.gameHistory, members: s.membersSnapshot || [] });
    }
    const spend = new Map<string, number>();
    const names = new Map<string, string>();
    const all: GameRecord[] = [];
    for (const src of sources) {
      all.push(...src.games);
      for (const m of src.members) {
        const k = m.id;
        names.set(k, m.name);
        spend.set(k, (spend.get(k) || 0) + (m.totalCourt || 0) + (m.totalShuttle || 0) + (m.totalSnack || 0));
      }
    }
    return { games: all, spendByKey: spend, nameByKey: names };
  }, [view, members, gameHistory, sessions, todayVisible]);

  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    const get = (key: string, name: string) => {
      let r = map.get(key);
      if (!r) { r = { key, name, games: 0, wins: 0, losses: 0, draws: 0, scored: 0, pointsFor: 0, pointsAgainst: 0, spent: 0 }; map.set(key, r); }
      return r;
    };
    for (const g of games) {
      const hasScore = typeof g.scoreA === 'number' && typeof g.scoreB === 'number';
      g.players.forEach((p, i) => {
        const r = get(p.id, p.name);
        r.games++;
        if (!hasScore) return;
        const mine = i < 2 ? g.scoreA! : g.scoreB!;
        const theirs = i < 2 ? g.scoreB! : g.scoreA!;
        r.scored++;
        r.pointsFor += mine;
        r.pointsAgainst += theirs;
        if (mine > theirs) r.wins++;
        else if (mine < theirs) r.losses++;
        else r.draws++;
      });
    }
    // คนที่เช็กอินแต่ยังไม่ได้ตี ก็ให้เห็นในตาราง (สำคัญกับบุฟเฟต์ — จะได้เห็นว่าใครยังไม่ได้ตีเลย)
    if (view === TODAY) members.forEach(m => get(m.id, m.name));
    map.forEach(r => { r.spent = spendByKey.get(r.key) || 0; r.name = nameByKey.get(r.key) || r.name; });
    const list = [...map.values()];
    list.sort((a, b) => {
      if (sortBy === 'wins') return b.wins - a.wins || (b.scored ? b.wins / b.scored : 0) - (a.scored ? a.wins / a.scored : 0);
      if (sortBy === 'spent') return b.spent - a.spent;
      return b.games - a.games;
    });
    return list;
  }, [games, members, view, spendByKey, nameByKey, sortBy]);

  const podium = rows.filter(r => (sortBy === 'wins' ? r.wins : sortBy === 'spent' ? r.spent : r.games) > 0).slice(0, 3);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const totalPaid = view === TODAY ? paymentHistory.reduce((s, p) => s + p.amount, 0) : null;
  const playersWithGames = rows.filter(r => r.games > 0);
  const avgGames = playersWithGames.length ? games.reduce((s, g) => s + g.players.length, 0) / (view === TODAY ? Math.max(1, members.filter(m => m.status !== 'away').length) : playersWithGames.length) : 0;
  const maxGames = Math.max(1, ...rows.map(r => r.games));
  const scoredGames = games.filter(g => typeof g.scoreA === 'number').length;

  // หารเท่า
  const splitPlayers = members.filter(m => m.gamesPlayed > 0).length;
  const splitTotal = modeConfig.splitCourtTotal + modeConfig.splitShuttleTotal;
  const splitShare = splitPlayers ? Math.ceil(modeConfig.splitCourtTotal / splitPlayers) + Math.ceil(modeConfig.splitShuttleTotal / splitPlayers) : 0;
  const splitDone = !!modeConfig.splitApplied && Object.keys(modeConfig.splitApplied).length > 0;

  const viewLabel = view === TODAY
    ? `วันนี้${sessionStartDate ? ' · ' + format(sessionStartDate, 'dd/MM/yyyy') : ''}`
    : view === ALL ? 'ทั้งหมด' : '';

  const card = 'bg-white rounded-3xl p-5 shadow-sm border border-on-surface/5';

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
          <BarChart3 size={24} className="text-primary" />
        </div>
        <div className="flex-1 min-w-[10rem]">
          <h2 className="font-headline font-black text-2xl text-on-surface">สถิติและอันดับ</h2>
          <p className="text-xs text-on-surface/40 font-bold">โหมดปัจจุบัน: {MODE_LABELS[mode]} · กดที่ชื่อเพื่อดูโปรไฟล์</p>
        </div>
        <select value={view} onChange={e => setView(e.target.value)}
          className="px-4 py-3 bg-white rounded-2xl font-bold text-sm border border-on-surface/10 focus:outline-none">
          {todayVisible && <option value={TODAY}>{viewLabel}</option>}
          <option value={ALL}>ทั้งหมด{modeFilter === 'all' ? 'ทุกวัน' : ` (${MODE_LABELS[modeFilter]})`}</option>
          {(['perGame', 'buffet', 'split', 'fun'] as SessionMode[]).filter(m => modeFilter === 'all' || modeFilter === m).map(m => {
            const list = sessions.filter(x => modeOf(x) === m);
            return list.length === 0 ? null : (
              <optgroup key={m} label={`${MODE_THEME[m].emoji} ${MODE_LABELS[m]}`}>
                {list.map(x => <option key={x.id} value={x.id}>{format(x.date, 'dd/MM/yyyy')}</option>)}
              </optgroup>
            );
          })}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => { setModeFilter('all'); setView(TODAY); }}
          className={cn('px-4 py-2 rounded-xl text-sm font-bold', modeFilter === 'all' ? 'bg-on-surface text-white' : 'bg-white text-on-surface/60')}>ทุกโหมด</button>
        {(Object.keys(MODE_LABELS) as SessionMode[]).map(m => (
          <button key={m} onClick={() => { setModeFilter(m); setView(m === mode ? TODAY : ALL); }}
            style={{ backgroundColor: modeFilter === m ? MODE_THEME[m].color : MODE_THEME[m].soft, color: modeFilter === m ? '#fff' : MODE_THEME[m].color }}
            className="px-4 py-2 rounded-xl text-sm font-bold">{MODE_THEME[m].emoji} {MODE_LABELS[m]}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={card}><p className="text-xs font-bold text-on-surface/40">เกมที่ตี</p><p className="font-headline font-black text-3xl">{games.length}</p></div>
        <div className={card}><p className="text-xs font-bold text-on-surface/40">ผู้เล่น</p><p className="font-headline font-black text-3xl">{playersWithGames.length}</p></div>
        <div className={card}><p className="text-xs font-bold text-on-surface/40">เกมที่บันทึกผล</p><p className="font-headline font-black text-3xl">{scoredGames}</p></div>
        <div className={card}>
          <p className="text-xs font-bold text-on-surface/40">ยอดเงินรวม{totalPaid !== null ? ` (จ่ายแล้ว ฿${totalPaid})` : ''}</p>
          <p className="font-headline font-black text-3xl">฿{totalSpent}</p>
        </div>
      </div>

      {view === TODAY && mode === 'split' && (
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

      {podium.length > 0 && (
        <section className="grid grid-cols-3 gap-2 sm:gap-4 items-end">
          {[podium[1], podium[0], podium[2]].map((r, col) => {
            if (!r) return <div key={col} />;
            const place = r === podium[0] ? 1 : r === podium[1] ? 2 : 3;
            const metric = sortBy === 'wins' ? `${r.wins} ชนะ` : sortBy === 'spent' ? `฿${r.spent}` : `${r.games} เกม`;
            return (
              <button key={r.key} onClick={() => setProfileId(r.key)}
                className={cn('rounded-3xl bg-white border-2 shadow-sm px-2 sm:px-4 text-center transition-all hover:-translate-y-1 hover:shadow-lg',
                  place === 1 ? 'pt-6 pb-5 border-amber-300 bg-amber-50' : place === 2 ? 'pt-4 pb-4 border-slate-200' : 'pt-4 pb-4 border-orange-200')}>
                <div className="text-3xl sm:text-4xl">{place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉'}</div>
                <p className="font-headline font-black text-sm sm:text-lg truncate mt-1">{r.name}</p>
                <p className="text-xs sm:text-sm font-bold text-primary">{metric}</p>
                <p className="hidden sm:block text-[11px] font-semibold text-on-surface/40 mt-0.5">ดูโปรไฟล์</p>
              </button>
            );
          })}
        </section>
      )}

      <div className="flex gap-2 items-center">
        <span className="text-xs font-bold text-on-surface/40 mr-1">เรียงตาม</span>
        {([['wins', 'ชนะ'], ['games', 'จำนวนเกม'], ['spent', 'เงิน']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSortBy(k)}
            className={cn('px-3 py-1.5 rounded-xl text-xs font-bold', sortBy === k ? 'bg-primary text-white' : 'bg-white text-on-surface/60')}>{l}</button>
        ))}
      </div>

      <section className={cn(card, 'overflow-x-auto p-0')}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-on-surface/40 border-b border-on-surface/5">
              <th className="p-3 w-10">#</th>
              <th className="p-3">ชื่อ</th>
              <th className="p-3 min-w-[9rem]">เกม{mode === 'buffet' && view === TODAY ? ` (เฉลี่ย ${avgGames.toFixed(1)})` : ''}</th>
              <th className="p-3 text-center"><Trophy size={14} className="inline" /> ชนะ</th>
              <th className="p-3 text-center">แพ้</th>
              <th className="p-3 text-center">เสมอ</th>
              <th className="p-3 text-center">%ชนะ</th>
              <th className="p-3 text-right"><Wallet size={14} className="inline" /> เงิน</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-on-surface/30">ยังไม่มีข้อมูล</td></tr>
            )}
            {rows.map((r, i) => {
              const behind = mode === 'buffet' && view === TODAY && r.games < avgGames - 0.5;
              return (
                <tr key={r.key} onClick={() => setProfileId(r.key)} className="border-b border-on-surface/5 last:border-0 cursor-pointer hover:bg-primary/5 transition-colors">
                  <td className="p-3 font-black text-on-surface/40">{i + 1}</td>
                  <td className="p-3 font-bold"><span className="underline-offset-2 hover:underline">{r.name}</span></td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', behind ? 'bg-amber-400' : 'bg-primary')} style={{ width: `${(r.games / maxGames) * 100}%` }} />
                      </div>
                      <span className="font-bold w-6 text-right">{r.games}</span>
                    </div>
                    {behind && <p className="text-[10px] font-bold text-amber-500">ควรได้ตีเพิ่ม</p>}
                  </td>
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

      {games.length > 0 && (
        <section className={cn(card, 'space-y-2')}>
          <h3 className="text-sm font-black text-on-surface/50 flex items-center gap-2"><Swords size={16} className="text-primary" /> เกมล่าสุด</h3>
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
        <PlayerProfileModal playerId={profileId} members={members} gameHistory={gameHistory} sessionHistory={sessionHistory} onClose={() => setProfileId(null)} />
      )}
    </div>
  );
}
