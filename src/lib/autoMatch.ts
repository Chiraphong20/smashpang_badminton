import { Member, AutoMatchOpts, RANK_WEIGHTS } from '../types';

const w = (m: Pick<Member, 'rank'>) => RANK_WEIGHTS[m.rank] || 0;

const combinations = <T,>(arr: T[], k: number): T[][] => {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [...combinations(rest, k - 1).map(c => [first, ...c]), ...combinations(rest, k)];
};

/**
 * เลือกผู้เล่นสำหรับเติมช่องว่าง (ใช้ร่วมกันทั้งหน้าจัดคอร์ทและหน้าต่างเพิ่มคิว)
 * - candidates: คนที่เลือกได้ เรียงเกมน้อย→มาก (เท่ากันเอาคนมาก่อน) และต้องมีอย่างน้อย `needed` คน
 * - existing: คนที่อยู่ในคอร์ท/คิวนี้แล้ว (ใช้เทียบระดับมือเมื่อเติมแค่ 1–3 คน)
 * - ผลลัพธ์: id เรียงตามช่องว่างที่จะใส่ · ถ้า needed = 4 สองคนแรก = ทีม A สองคนหลัง = ทีม B (จัดให้สมดุล)
 */
export function chooseAutoPlayers(candidates: Member[], existing: Member[], needed: number, opts: AutoMatchOpts): string[] {
  if (needed < 4) {
    const avgW = existing.reduce((a, m) => a + w(m), 0) / Math.max(1, existing.length);
    const cost = (m: Member) => {
      const rd = Math.abs(w(m) - avgW);
      if (opts.mode === 'games') return m.gamesPlayed * 100 + m.checkInTime / 1e13;
      if (opts.mode === 'rank') return rd * (opts.rankMode === 'same' ? 100 : 10) + m.gamesPlayed * 0.5;
      return m.gamesPlayed * 1.5 + rd * (opts.rankMode === 'same' ? 6 : 3);
    };
    return [...candidates].sort((a, b) => cost(a) - cost(b)).slice(0, needed).map(m => m.id);
  }

  // ต้องการ 4 คน — games: 4 คนเล่นน้อยสุด · rank: ค้นหาจากคนรอสูงสุด 20 คนต้นคิว · both: pool 8 คนต้นคิว
  const pool = candidates.slice(0, Math.min(opts.mode === 'games' ? 4 : opts.mode === 'rank' ? 20 : 8, candidates.length));
  const teamDiffOf = (ws: number[]) => Math.min(
    Math.abs(ws[0] + ws[1] - ws[2] - ws[3]),
    Math.abs(ws[0] + ws[2] - ws[1] - ws[3]),
    Math.abs(ws[0] + ws[3] - ws[1] - ws[2]),
  );
  const avgGames = pool.reduce((a, m) => a + m.gamesPlayed, 0) / Math.max(1, pool.length);
  const score = (group: Member[]): number => {
    const ws = group.map(w);
    const teamDiff = teamDiffOf(ws);
    const rankRange = Math.max(...ws) - Math.min(...ws);
    const gamesSum = group.reduce((a, m) => a + m.gamesPlayed, 0);
    if (opts.mode === 'games') return teamDiff;
    if (opts.mode === 'rank') {
      const rangeCost = opts.rankMode === 'same' ? rankRange * 100 : Math.max(0, rankRange - 2) * 40 + rankRange * 4;
      return rangeCost + teamDiff + gamesSum * 0.8;
    }
    const rangePenalty = opts.rankMode === 'same' ? rankRange * 12 : Math.max(0, rankRange - 2) * 6;
    const hasTop2 = group.some(m => m.id === pool[0].id) && group.some(m => m.id === pool[1].id);   // ประกันว่าคนรอนานได้ลง
    const gamesPenalty = group.reduce((s, m) => s + Math.max(0, m.gamesPlayed - avgGames), 0) * 0.4;
    return teamDiff + rangePenalty + (hasTop2 ? 0 : 4) + gamesPenalty;
  };

  let best = pool.slice(0, 4);
  let bestScore = Infinity;
  for (const combo of combinations(pool, 4)) {
    const sc = score(combo);
    if (sc < bestScore) { bestScore = sc; best = combo; }
  }
  // จัด team split ที่สมดุลที่สุด
  const bw = best.map(m => ({ id: m.id, w: w(m) }));
  const splits = [
    { order: [bw[0].id, bw[1].id, bw[2].id, bw[3].id], diff: Math.abs(bw[0].w + bw[1].w - bw[2].w - bw[3].w) },
    { order: [bw[0].id, bw[2].id, bw[1].id, bw[3].id], diff: Math.abs(bw[0].w + bw[2].w - bw[1].w - bw[3].w) },
    { order: [bw[0].id, bw[3].id, bw[1].id, bw[2].id], diff: Math.abs(bw[0].w + bw[3].w - bw[1].w - bw[2].w) },
  ];
  return splits.reduce((b, s) => (s.diff < b.diff ? s : b)).order;
}
