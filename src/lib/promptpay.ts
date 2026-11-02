// สร้าง payload QR พร้อมเพย์ (EMV QR แบบมียอดเงิน) — ไม่ต้องพึ่งบริการภายนอก ข้อมูลไม่ออกจากเครื่อง
// รองรับ: เบอร์มือถือ (10 หลัก ขึ้นต้น 0) · เลขบัตรประชาชน/เลขผู้เสียภาษี (13 หลัก) · e-Wallet ID (15 หลัก)

const tlv = (id: string, value: string) => id + String(value.length).padStart(2, '0') + value;

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) ตามมาตรฐาน EMV QR
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export type PromptPayKind = 'phone' | 'citizen' | 'ewallet';

export function parsePromptPayId(raw: string): { kind: PromptPayKind; digits: string } | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (/^0[689]\d{8}$/.test(digits)) return { kind: 'phone', digits }; // พร้อมเพย์ผูกกับเบอร์มือถือเท่านั้น
  if (digits.length === 13) return { kind: 'citizen', digits };
  if (digits.length === 15) return { kind: 'ewallet', digits };
  return null;
}

// payload สำหรับสร้าง QR · amount > 0 = ล็อกยอด (dynamic) · ไม่ใส่ = ให้ผู้จ่ายกรอกเอง (static)
export function promptPayPayload(rawId: string, amount?: number): string | null {
  const id = parsePromptPayId(rawId);
  if (!id) return null;
  const target = id.kind === 'phone' ? tlv('01', '0066' + id.digits.slice(1)) : id.kind === 'citizen' ? tlv('02', id.digits) : tlv('03', id.digits);
  const account = tlv('00', 'A000000677010111') + target;
  const amt = amount && amount > 0 ? (Math.round(amount * 100) / 100).toFixed(2) : '';
  // ลำดับแท็กเรียงเหมือนไลบรารีมาตรฐานที่ใช้จริงกันแพร่หลาย (58 ก่อน 53) เพื่อให้ได้ payload เดียวกันทุกไบต์
  const body = tlv('00', '01') + tlv('01', amt ? '12' : '11') + tlv('29', account) + tlv('58', 'TH') + tlv('53', '764') + (amt ? tlv('54', amt) : '') + '6304';
  return body + crc16(body);
}

// แสดงเลขที่ปิดบางส่วน เช่น 081-234-5678 → 081-xxx-5678
export function maskPromptPayId(raw: string): string {
  const id = parsePromptPayId(raw);
  if (!id) return '';
  const d = id.digits;
  return id.kind === 'phone' ? `${d.slice(0, 3)}-xxx-${d.slice(6)}` : `${d.slice(0, 1)}-xxxx-xxxxx-${d.slice(-3, -1)}-${d.slice(-1)}`;
}
