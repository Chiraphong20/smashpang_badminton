import type { SessionRecord } from '../types';

// คนที่ "มาตีวันนั้นจริงๆ" ของเซสชันหนึ่ง — ไม่นับสมาชิกทั้งฐานข้อมูลที่ไม่ได้มา
// (membersSnapshot เก็บรายชื่อสมาชิกทั้งหมดตอนจบวัน) · กฎเดียวกับการ์ด "จำนวนผู้เล่น" ในหน้าหลัก
// + รวมคนที่ปรากฏในเกมของวันนั้นด้วย เผื่อแก้สถานะภายหลัง
export function sessionPlayerIds(s: SessionRecord): Set<string> {
  const ids = new Set<string>();
  (s.membersSnapshot || []).forEach(m => {
    if (m.status !== 'resting' || m.balance > 0 || m.gamesPlayed > 0) ids.add(m.id);
  });
  (s.gameHistory || []).forEach(g => g.players.forEach(p => ids.add(p.id)));
  return ids;
}
