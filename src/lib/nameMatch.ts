// หาชื่อสมาชิกที่ "น่าจะเป็นคนเดียวกัน" กับชื่อที่ลงมาใหม่ เช่น แก้ว ↔ แม่แก้ว, เบอ/เบอร์/เบลอ ↔ พี่เบอ
// ใช้ถามผู้จัดก่อนรวมชื่อ (ไม่รวมเองอัตโนมัติ เพราะอาจเป็นคนละคนที่ชื่อคล้ายกัน)

// คำนำหน้าที่คนมักใส่/ไม่ใส่ (ยาวก่อน เพื่อให้ตัดคำที่ยาวกว่าได้ก่อน)
const HONORIFICS = ['อาจารย์', 'น้อง', 'พี่', 'แม่', 'พ่อ', 'คุณ', 'ป้า', 'ลุง', 'น้า', 'ครู', 'หมอ', 'โค้ช', 'เฮีย', 'เจ๊', 'ซ้อ', 'ตี๋'];

export function nameCore(name: string): string {
  let s = name.toLowerCase().trim();
  s = s.replace(/[\s.\-_,()[\]{}'"`~*+/\\|:;!?@#$%^&=<>\p{Extended_Pictographic}]/gu, '');
  for (const h of HONORIFICS) {
    if (s.startsWith(h) && s.length - h.length >= 2) { s = s.slice(h.length); break; }
  }
  s = s
    .replace(/[่้๊๋]/g, '') // ไม้เอก โท ตรี จัตวา
    .replace(/.์/g, '')                   // ตัวการันต์ (ร์ ฟ์ ...) พร้อมตัวอักษรที่ถูกฆ่า
    .replace(/็/g, '');                   // ไม้ไต่คู้
  if (s.length > 2 && s.endsWith('ร')) s = s.slice(0, -1); // เบอร → เบอ
  return s;
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

// 0 = ไม่ใกล้เคียง · มากกว่า = ใกล้เคียงมากกว่า
export function nameSimilarity(a: string, b: string): number {
  const ca = nameCore(a), cb = nameCore(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  if (short.length >= 2 && long.includes(short) && short.length / long.length >= 0.5) return 0.85;
  const d = lev(ca, cb);
  if (short.length >= 3 && d <= 1) return 0.8;
  if (short.length >= 5 && d <= 2) return 0.7;
  return 0;
}

// สมาชิกเดิมที่ใกล้เคียงกับชื่อนี้ (ไม่รวมชื่อที่ตรงกันเป๊ะ) เรียงจากใกล้เคียงมากไปน้อย
export function similarNames(name: string, existing: string[], limit = 3): string[] {
  const n = name.trim().toLowerCase();
  if (!n) return [];
  return existing
    .filter(e => e.trim().toLowerCase() !== n)
    .map(e => ({ e, s: nameSimilarity(name, e) }))
    .filter(x => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map(x => x.e);
}
