// ตัวช่วยจัดอันดับ: ช่วงเวลา + Tier
export type Period = string; // 'today' | 'all' | 'thisMonth' | 'lastMonth' | 'last30' | 'custom' | 'm:YYYY-MM'

export interface Range { start: number; end: number }

export function rangeFor(period: Period, from: string, to: string, now = new Date()): Range | null {
  const y = now.getFullYear(), m = now.getMonth();
  if (period === 'all' || period === 'today') return null;
  if (period === 'thisMonth') return { start: new Date(y, m, 1).getTime(), end: Infinity };
  if (period === 'lastMonth') return { start: new Date(y, m - 1, 1).getTime(), end: new Date(y, m, 1).getTime() - 1 };
  if (period === 'last30') return { start: now.getTime() - 30 * 24 * 3600 * 1000, end: Infinity };
  if (period.startsWith('m:')) {
    const [yy, mm] = period.slice(2).split('-').map(Number);
    return { start: new Date(yy, mm - 1, 1).getTime(), end: new Date(yy, mm, 1).getTime() - 1 };
  }
  // custom: ตั้งแต่วันที่ .. ถึงวันที่ (รวมวันสุดท้ายทั้งวัน) — เว้นว่างด้านใดด้านหนึ่ง = ไม่จำกัดด้านนั้น
  const start = from ? new Date(from + 'T00:00:00').getTime() : -Infinity;
  const end = to ? new Date(to + 'T23:59:59').getTime() : Infinity;
  return { start, end };
}

export type Tier = 'S' | 'A' | 'B' | 'C';

// แบ่ง Tier ตามอันดับ: S = 15% แรก, A = ถึง 40%, B = ถึง 75%, ที่เหลือ C
// คนที่ค่าเท่ากันอยู่ Tier เดียวกัน (ใช้อันดับของคนแรกที่ได้ค่านั้น) · ค่า <= 0 ไม่ถูกจัด Tier
export function assignTiers<T>(sorted: T[], value: (x: T) => number): Map<T, Tier> {
  const eligible = sorted.filter(x => value(x) > 0);
  const n = eligible.length;
  const out = new Map<T, Tier>();
  const cut = (p: number) => Math.max(1, Math.ceil(n * p));
  const sCut = cut(0.15), aCut = Math.max(sCut + (n > 1 ? 1 : 0), cut(0.4)), bCut = Math.max(aCut, cut(0.75));
  let firstIdx = 0;
  eligible.forEach((x, i) => {
    if (i === 0 || value(x) !== value(eligible[i - 1])) firstIdx = i;
    out.set(x, firstIdx < sCut ? 'S' : firstIdx < aCut ? 'A' : firstIdx < bCut ? 'B' : 'C');
  });
  return out;
}
