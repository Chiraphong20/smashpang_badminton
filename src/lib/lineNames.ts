import type { Rank } from '../types';

// แยก "ชื่อ" ออกจากข้อความลงชื่อใน LINE (รายการเลขข้อ เช่น "1.พี่ออต 18:00", "11.ป่องขอแจมด้วยคนครับ")
// - ใช้เฉพาะบรรทัดที่ขึ้นต้นด้วยเลขข้อ ส่วนหัวข้อ/วันที่/เลขสนาม/ข้อความประกาศไม่เอา
// - ตัดเวลา อีโมจิ คำลงท้าย (ค่ะ ครับ นะ) และ "ขอแจม..." ออก
// - บรรทัดเลขข้อที่ยังว่างข้ามไป · ชื่อซ้ำเก็บอันแรก · รายชื่อ "สำรอง" ไม่นับ (เป็นคิวรอ ไม่ใช่ผู้เล่น)
// - ถ้าไม่มีเลขข้อเลย (วางเป็นรายชื่อบรรทัดละชื่อ) จะใช้ทุกบรรทัดที่ดูเป็นชื่อ

export interface ParsedName { name: string; rank?: Rank }

const RANK_RE = /^(VIP[1-3]|BG[1-3]|S-?[1-3]|P[+-]?|N)$/i;

const cleanName = (raw: string): ParsedName | null => {
  let c = raw
    .replace(/[\p{Extended_Pictographic}‍️‼❗❕✌🏻-🏿]/gu, ' ')
    .replace(/[‼!！]+/g, ' ')
    .trim();

  let rank: Rank | undefined;
  const rm = c.match(/[(\[]\s*(VIP[1-3]|BG[1-3]|S-?[1-3]|P[+-]?)\s*[)\]]/i) || c.match(/\s+(VIP[1-3]|BG[1-3]|S-?[1-3]|P[+-]?)$/i);
  if (rm && RANK_RE.test(rm[1])) { rank = rm[1].toUpperCase() as Rank; c = c.replace(rm[0], ' '); }

  c = c
    .replace(/\s*[(（]?\s*\d{1,2}\s*[:.]\s*\d{2}\s*(น\.?|นาฬิกา)?\s*[)）]?.*$/u, '') // เวลา 18:00 / 18.30 / 17.30น. และคำที่ตามหลัง
    .replace(/\s*[(（].*?[)）].*$/u, '')                                              // หมายเหตุในวงเล็บ
    .replace(/ขอแจม.*$/u, '')                                                         // "ป่องขอแจมด้วยคนครับ" → "ป่อง"
    .replace(/\s+(ค่ะ|คะ|ครับ|นะ|เจ้า|จ้า).*$/u, '')                                  // คำลงท้ายที่แยกด้วยช่องว่าง
    .replace(/(ค่ะ|ครับ)$/u, '')
    .replace(/[\s.,:;\-–—_~*]+$/u, '')
    .replace(/^[\s.,:;\-–—_~*]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!c || /^\d+$/.test(c) || c.length > 30) return null;
  return { name: c, rank };
};

export function parseLineNames(text: string): ParsedName[] {
  const lines = text.split(/\r?\n/);
  const numbered = /^\s*\d{1,3}\s*(?:[.):\-]|\s)\s*(.*)$/u;
  const hasNumbers = lines.some(l => numbered.test(l) && (numbered.exec(l)![1] || '').trim());

  const out: ParsedName[] = [];
  const seen = new Set<string>();
  let reserve = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/สำรอง/.test(t) && !numbered.test(t)) { reserve = true; continue; }
    if (reserve) continue;

    let body: string | null = null;
    const m = numbered.exec(t);
    if (m) body = m[1];
    else if (!hasNumbers) {
      // รายชื่อบรรทัดละชื่อ: ตัดส่วนหัวข้อที่ยาวหรือมีเครื่องหมายบอกว่าเป็นประโยค
      if (/[:：]/.test(t) || t.length > 30 || /\s{2,}/.test(t)) continue;
      body = t.replace(/^[-•*]\s+/, '');
    }
    if (body == null) continue;

    const n = cleanName(body);
    if (!n) continue;
    const key = n.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}
