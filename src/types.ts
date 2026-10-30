export type Rank =
  | 'VIP1' | 'VIP2' | 'VIP3'
  | 'BG1' | 'BG2' | 'BG3'
  | 'S-1' | 'S-2' | 'S-3'
  | 'S1' | 'S2' | 'S3'
  | 'N' | 'P-' | 'P' | 'P+';

export interface Member {
  id: string;
  name: string;
  rank: Rank;
  gamesPlayed: number;
  checkInTime: number;
  status: 'waiting' | 'playing' | 'resting' | 'away' | 'paid';
  balance: number;       // รวมทั้งหมด
  courtBalance: number;  // ค่าสนาม
  shuttleBalance: number;// ค่าลูก
  shuttleCount: number;  // จำนวนลูก
  snackBalance: number;  // ค่าน้ำ/ขนมรวม
  snackHistory: Array<{ id: string; name: string; price: number; time: number }>; // ประวัติการซื้อสินค้า
  paidCourtFee: boolean;
  // Totals for the session (never decreased by payment)
  totalCourt?: number;
  totalShuttle?: number;
  totalSnack?: number;
  // Payment info
  paidBy?: string;
  paidByName?: string;
}

export interface Court {
  id: string;
  name: string;
  players: (string | null)[];
  status: 'empty' | 'active';
  startTime?: number;
  shuttlecocks: number;
}

export interface Snack {
  id: string;
  name: string;
  price: number;
  icon: string;
  image?: string; // URL path from public folder
}

export interface GameRecord {
  id: string;
  courtId: string;
  courtName: string;
  playedAt: number;
  players: Array<{ id: string; name: string; rank: Rank }>;
  shuttlesUsed: number;
  shuttleCostPerPerson: number;
  courtFeePerPerson: number; // 0 ถ้าเจ้าตัวเคยจ่ายแล้ว
  // คะแนน (ทีม A = players[0..1], ทีม B = players[2..3]) — ไม่มี = ไม่ได้บันทึกผล
  scoreA?: number;
  scoreB?: number;
}

// รูปแบบการจัดก๊วน
//  perGame = คิดตามเกม (ค่าคอร์ดครั้งเดียว + ค่าลูกต่อเกม)
//  buffet  = บุฟเฟต์ ราคาเดียวตีกี่เกมก็ได้
//  split   = หารเท่า (ค่าสนาม + ค่าลูก รวมแล้วหารตามจำนวนคน)
//  fun     = ตีเฮฮา ไม่คิดเงิน นับแต้ม
export type SessionMode = 'perGame' | 'buffet' | 'split' | 'fun';

export interface ModeConfig {
  buffetPrice: number;        // ราคาบุฟเฟต์ต่อคน
  splitCourtTotal: number;    // ค่าเช่าสนามรวม (หารเท่า)
  splitShuttleTotal: number;  // ค่าลูกรวม (หารเท่า)
  trackScore: boolean;        // ถามคะแนนทุกครั้งที่จบเกม
  // ยอดที่เรียกเก็บแบบหารเท่าไปแล้วต่อคน (ไว้ย้อนก่อนคิดใหม่)
  splitApplied?: Record<string, { court: number; shuttle: number }>;
}

// ธีมสีประจำโหมด — ใช้ทั้งหน้าเลือกโหมด และเปลี่ยนสีหลักของทั้งแอป (ดู [data-mode] ใน index.css)
export const MODE_THEME: Record<SessionMode, { emoji: string; desc: string; color: string; soft: string; colorName: string }> = {
  perGame: { emoji: '🏸', desc: 'ค่าคอร์ดครั้งเดียว + ค่าลูกตามเกมที่ตี', color: '#1b2a6b', soft: '#e8ebf8', colorName: 'กรมท่า' },
  buffet: { emoji: '🎟️', desc: 'ราคาเดียว ตีกี่เกมก็ได้ ดูจำนวนเกมเพื่อเฉลี่ยให้เท่ากัน', color: '#ea580c', soft: '#fff1e6', colorName: 'ส้ม' },
  split: { emoji: '➗', desc: 'รวมค่าสนาม + ค่าลูก แล้วหารเท่ากันทุกคน', color: '#5b21b6', soft: '#f1eafc', colorName: 'ม่วง' },
  fun: { emoji: '🔀', desc: 'สุ่มจับคู่เพื่อนตีเฮฮา ไม่คิดเงิน นับแต้ม ดูแพ้/ชนะและอันดับ', color: '#0f766e', soft: '#e3f6f3', colorName: 'เขียวเทอร์ควอยซ์' },
};

export const DEFAULT_MODE_CONFIG: ModeConfig = {
  buffetPrice: 150,
  splitCourtTotal: 0,
  splitShuttleTotal: 0,
  trackScore: false,
};

export const MODE_LABELS: Record<SessionMode, string> = {
  perGame: 'นับเกม',
  buffet: 'บุฟเฟต์',
  split: 'หารเท่า',
  fun: 'สุ่มเพื่อน',
};

export interface PaymentRecord {
  id: string;
  memberId: string;
  memberName: string;
  memberRank: Rank;
  amount: number;
  timestamp: number;
  method: string;
  note?: string;
  details?: {
    courtBalance: number;
    shuttleBalance: number;
    snackHistory: Array<{ id: string; name: string; price: number; time: number }>;
  };
}

export interface QueuePlayer {
  memberId?: string;
  name: string;
  rank: Rank;
}

export interface CourtQueueSlot {
  id: string;
  teamA: QueuePlayer[];
  teamB: QueuePlayer[];
  note?: string;
}

export interface SessionRecord {
  id: string;
  date: number;
  gameHistory: GameRecord[];
  paymentHistory: PaymentRecord[];
  membersSnapshot: Member[];
  mode?: SessionMode;
  modeConfig?: ModeConfig;
}

export const RANKS: Rank[] = [
  'P+', 'P', 'P-', 'N',
  'S3', 'S2', 'S1',
  'S-3', 'S-2', 'S-1',
  'BG3', 'BG2', 'BG1',
  'VIP3', 'VIP2', 'VIP1'
];

export const RANK_LEVEL_LABELS: Record<Rank, string> = {
  'P+': '', 'P': '', 'P-': '', 'N': '',
  'S3': '', 'S2': '', 'S1': '',
  'S-3': '', 'S-2': '', 'S-1': '',
  'BG3': '', 'BG2': '', 'BG1': '',
  'VIP3': '', 'VIP2': '', 'VIP1': ''
};

export const RANK_COLORS: Record<Rank, string> = {
  'P+': 'bg-tertiary text-white',
  'P': 'bg-tertiary text-white',
  'P-': 'bg-tertiary text-white',
  'N': 'bg-tertiary text-white',
  'S3': 'bg-secondary text-white',
  'S2': 'bg-secondary text-white',
  'S1': 'bg-secondary text-white',
  'S-3': 'bg-secondary text-white',
  'S-2': 'bg-secondary text-white',
  'S-1': 'bg-secondary text-white',
  'BG3': 'bg-error text-white',
  'BG2': 'bg-error text-white',
  'BG1': 'bg-error text-white',
  'VIP3': 'bg-error text-white',
  'VIP2': 'bg-error text-white',
  'VIP1': 'bg-error text-white',
};

export const RANK_WEIGHTS: Record<Rank, number> = {
  'P+': 16,
  'P': 15,
  'P-': 14,
  'N': 13,
  'S3': 12, 'S2': 11, 'S1': 10,
  'S-3': 9, 'S-2': 8, 'S-1': 7,
  'BG3': 6, 'BG2': 5, 'BG1': 4,
  'VIP3': 3, 'VIP2': 2, 'VIP1': 1,
};

