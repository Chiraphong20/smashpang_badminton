import React, { useState } from 'react';
import {
  Settings,
  RefreshCw,
  TrendingUp,
  Plus,
  Trash2,
  QrCode,
  Copy,
  Check,
  Download,
  Lock,
} from 'lucide-react';
import { ListingEditor } from './ListingEditor';
import { Rank, SessionMode, ModeConfig, MODE_LABELS, MODE_THEME } from '../types';

const MODE_INFO: Record<SessionMode, string> = {
  perGame: 'ค่าคอร์ดครั้งเดียว + ค่าลูกคิดตามเกมที่ตี',
  buffet: 'ราคาเดียว ตีกี่เกมก็ได้ — ดูจำนวนเกมของแต่ละคนเพื่อเฉลี่ยให้เท่ากัน',
  split: 'รวมค่าสนาม + ค่าลูก แล้วหารเท่าตามจำนวนคนที่ได้ตี (กดเรียกเก็บในแท็บสถิติ)',
  fun: 'ตีเฮฮา ไม่คิดเงิน นับแต้ม ดูแพ้/ชนะและอันดับ',
};

interface Props {
  courtFeePerPerson: number;
  setCourtFeePerPerson: (val: number) => void;
  shuttlePrice: number;
  setShuttlePrice: (val: number) => void;
  onSeedMockHistory: () => void;
  onResetDay: () => void;
  onFactoryReset: () => void;
  rankMemory: Record<string, Rank>;
  onChangePin: (pin: string) => Promise<boolean>;
  onLogout: () => void;
  onSwitchGroup: () => void;
  queueUrl: string;
  sessionMode: SessionMode;
  setSessionMode: (m: SessionMode) => void;
  modeConfig: ModeConfig;
  setModeConfig: React.Dispatch<React.SetStateAction<ModeConfig>>;
}

export function SettingsTab({
  courtFeePerPerson, setCourtFeePerPerson,
  shuttlePrice, setShuttlePrice,
  onSeedMockHistory, onResetDay, onFactoryReset,
  rankMemory, onChangePin, onLogout, onSwitchGroup, queueUrl,
  sessionMode, setSessionMode, modeConfig, setModeConfig
}: Props) {
  const [copied, setCopied] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinSaved, setPinSaved] = useState(false);

  const savePin = async () => {
    if (pinInput.length < 4) { alert('PIN ต้องมีอย่างน้อย 4 หลัก'); return; }
    if (!/^\d+$/.test(pinInput)) { alert('PIN ต้องเป็นตัวเลขเท่านั้น'); return; }
    if (!(await onChangePin(pinInput))) { alert('เปลี่ยน PIN ไม่สำเร็จ ลองใหม่อีกครั้ง'); return; }
    setPinInput('');
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 2000);
  };
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(queueUrl)}`;

  const copyUrl = () => {
    navigator.clipboard.writeText(queueUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQr = async () => {
    const res = await fetch(qrSrc);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'queue-qrcode.png';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-20">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
          <Settings size={24} className="text-primary" />
        </div>
        <div>
          <h2 className="font-headline font-black text-2xl text-on-surface">ตั้งค่าระบบ</h2>
          <p className="text-xs text-on-surface/40 font-bold uppercase tracking-widest">System Configuration & Maintenance</p>
        </div>
      </div>



      <ListingEditor />

      {/* Session Mode */}
      <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-on-surface/5 space-y-5">
        <h3 className="text-sm font-black uppercase tracking-widest text-on-surface/40">รูปแบบการจัดก๊วน</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(Object.keys(MODE_LABELS) as SessionMode[]).map(m => (
            <button key={m} onClick={() => setSessionMode(m)}
              style={{ backgroundColor: sessionMode === m ? MODE_THEME[m].color : MODE_THEME[m].soft, color: sessionMode === m ? '#fff' : MODE_THEME[m].color, borderColor: MODE_THEME[m].color }}
              className="px-4 py-3 rounded-2xl font-bold text-sm transition-all border-2">
              {MODE_THEME[m].emoji} {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <p className="text-xs text-on-surface/50 ml-1">{MODE_INFO[sessionMode]}</p>
        <p className="text-xs text-on-surface/30 ml-1">เปลี่ยนโหมดกลางวันได้ แต่ยอดที่คิดไปแล้วจะไม่ถูกคำนวณใหม่ — แนะนำให้เลือกก่อนเริ่มตีเกมแรก</p>

        {sessionMode === 'buffet' && (
          <label className="block space-y-2">
            <span className="text-xs font-bold text-on-surface/40 ml-2">ราคาบุฟเฟต์ต่อคน (฿)</span>
            <input type="number" min={0} value={modeConfig.buffetPrice}
              onChange={e => setModeConfig(c => ({ ...c, buffetPrice: Math.max(0, Number(e.target.value) || 0) }))}
              className="w-full px-6 py-4 bg-background rounded-2xl font-headline font-black text-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 border-none" />
          </label>
        )}
        {sessionMode === 'split' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block space-y-2">
              <span className="text-xs font-bold text-on-surface/40 ml-2">ค่าเช่าสนามรวม (฿)</span>
              <input type="number" min={0} value={modeConfig.splitCourtTotal}
                onChange={e => setModeConfig(c => ({ ...c, splitCourtTotal: Math.max(0, Number(e.target.value) || 0) }))}
                className="w-full px-6 py-4 bg-background rounded-2xl font-headline font-black text-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 border-none" />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-bold text-on-surface/40 ml-2">ค่าลูกรวม (฿)</span>
              <input type="number" min={0} value={modeConfig.splitShuttleTotal}
                onChange={e => setModeConfig(c => ({ ...c, splitShuttleTotal: Math.max(0, Number(e.target.value) || 0) }))}
                className="w-full px-6 py-4 bg-background rounded-2xl font-headline font-black text-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 border-none" />
            </label>
          </div>
        )}
        {sessionMode !== 'fun' && (
          <label className="flex items-center gap-3 text-sm font-semibold text-on-surface/70 cursor-pointer">
            <input type="checkbox" checked={modeConfig.trackScore}
              onChange={e => setModeConfig(c => ({ ...c, trackScore: e.target.checked }))} className="w-5 h-5" />
            ถามคะแนนทุกครั้งที่จบเกม (เก็บสถิติแพ้/ชนะ)
          </label>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* PIN Section */}
        <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-on-surface/5 space-y-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-on-surface/40 flex items-center gap-2">
            <Lock size={18} className="text-primary" />
            PIN เข้าสู่ระบบ
          </h3>
          <div className="space-y-3">
            <label className="text-xs font-bold text-on-surface/40 ml-2">PIN ใหม่ ({pinInput.length} หลัก)</label>
            <div className="flex gap-3">
              <input
                type="password"
                inputMode="numeric"
                value={pinInput}
                onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
                className="flex-1 px-6 py-4 bg-background rounded-2xl font-headline font-black text-3xl tracking-[0.5em] focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all border-none"
                placeholder="••••"
              />
              <button
                onClick={savePin}
                className="px-5 py-4 bg-primary text-white rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all shrink-0"
              >
                {pinSaved ? <Check size={20} /> : 'บันทึก'}
              </button>
            </div>
            <p className="text-xs text-on-surface/30 ml-2">ตัวเลข 4–8 หลัก · ใช้เมื่อเข้าสู่ระบบครั้งถัดไป</p>
            <div className="flex gap-3 pt-2">
              <button onClick={onLogout} className="px-4 py-2 bg-background rounded-xl text-xs font-bold text-on-surface/60 hover:bg-on-surface/10 transition-all">ออกจากระบบ</button>
              <button onClick={onSwitchGroup} className="px-4 py-2 bg-background rounded-xl text-xs font-bold text-on-surface/60 hover:bg-on-surface/10 transition-all">เปลี่ยนก๊วน</button>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-on-surface/5 space-y-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-on-surface/40 flex items-center gap-2">
            <TrendingUp size={18} className="text-primary" />
            ราคาและค่าบริการ
          </h3>
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-xs font-bold text-on-surface/40 ml-2">ค่าสนามต่อคน (฿)</label>
              <input 
                type="number" 
                value={courtFeePerPerson} 
                onChange={e => setCourtFeePerPerson(Number(e.target.value))}
                className="w-full px-6 py-4 bg-background rounded-2xl font-headline font-black text-3xl focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all border-none" 
              />
            </div>
            <div className="space-y-3">
              <label className="text-xs font-bold text-on-surface/40 ml-2">ราคาลูกแบด (฿)</label>
              <input 
                type="number" 
                value={shuttlePrice} 
                onChange={e => setShuttlePrice(Number(e.target.value))}
                className="w-full px-6 py-4 bg-background rounded-2xl font-headline font-black text-3xl focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all border-none" 
              />
            </div>
          </div>
        </section>
      </div>

      {/* System Maintenance Section */}
      <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-on-surface/5 space-y-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-on-surface/40">การจัดการระบบ</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button onClick={onSeedMockHistory} 
            className="flex items-center justify-between p-6 bg-secondary/5 hover:bg-secondary/10 rounded-3xl transition-all group border-none">
            <div className="text-left">
              <p className="text-sm font-black text-secondary uppercase leading-tight">Mock Data</p>
              <p className="text-xs text-on-surface/45 font-semibold">สร้างข้อมูลจำลอง</p>
            </div>
            <Plus size={20} className="text-secondary group-hover:scale-125 transition-all" />
          </button>
          <button onClick={onResetDay} 
            className="flex items-center justify-between p-6 bg-error/5 hover:bg-error/10 rounded-3xl transition-all group border-none">
            <div className="text-left">
              <p className="text-sm font-black text-error uppercase leading-tight">Reset Day</p>
              <p className="text-xs text-on-surface/45 font-semibold">เริ่มวันใหม่/ล้างกระดาน</p>
            </div>
            <RefreshCw size={20} className="text-error group-hover:rotate-180 transition-all duration-500" />
          </button>
          <button onClick={onFactoryReset} 
            className="flex items-center justify-between p-6 bg-error/5 hover:bg-error/10 rounded-3xl transition-all group border-none">
            <div className="text-left">
              <p className="text-sm font-black text-error uppercase leading-tight">Factory Reset</p>
              <p className="text-xs text-on-surface/45 font-semibold">ลบข้อมูลทั้งหมดถาวร</p>
            </div>
            <Trash2 size={20} className="text-error group-hover:scale-125 transition-all" />
          </button>
        </div>
      </section>

      {/* QR Code Section */}
      <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-on-surface/5">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-secondary/10 rounded-2xl flex items-center justify-center">
            <QrCode size={20} className="text-secondary" />
          </div>
          <div>
            <h3 className="font-bold text-base text-on-surface">QR Code — หน้าคิวสำหรับลูกค้า</h3>
            <p className="text-xs text-on-surface/45 font-semibold">ลูกค้าสแกนเพื่อดูคิวรอและสนามที่กำลังตีอยู่</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-8">
          <div className="flex flex-col items-center gap-3 shrink-0">
            <div className="bg-white p-3 rounded-2xl border-2 border-on-surface/5 shadow-sm">
              <img
                src={qrSrc}
                alt="Queue QR Code"
                width={180}
                height={180}
                className="rounded-xl"
              />
            </div>
            <button
              onClick={downloadQr}
              className="flex items-center gap-2 bg-on-surface/5 hover:bg-on-surface/10 text-on-surface/60 px-5 py-2 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95 w-full justify-center"
            >
              <Download size={15} /> ดาวน์โหลด QR
            </button>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <p className="text-xs font-bold text-on-surface/40 mb-2">URL หน้าคิว</p>
              <div className="flex items-center gap-2 bg-background rounded-2xl px-4 py-3">
                <p className="text-sm font-semibold text-on-surface/70 flex-1 truncate">{queueUrl}</p>
                <button
                  onClick={copyUrl}
                  className="flex items-center gap-1.5 bg-primary text-white px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 hover:scale-105 active:scale-95 transition-all"
                >
                  {copied ? <><Check size={12} /> คัดลอกแล้ว</> : <><Copy size={12} /> คัดลอก</>}
                </button>
              </div>
            </div>

            <div className="space-y-2 text-sm text-on-surface/50">
              <p className="flex items-center gap-2 font-semibold">✅ แสดงสนามที่กำลังตีอยู่</p>
              <p className="flex items-center gap-2 font-semibold">✅ แสดงคิวรอตามลำดับ</p>
              <p className="flex items-center gap-2 font-semibold">✅ อัปเดตอัตโนมัติทุก 20 วินาที</p>
              <p className="flex items-center gap-2 font-semibold">✅ ไม่ต้องล็อกอิน — ดูได้ทุกคน</p>
            </div>

            <a
              href={queueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-secondary/10 text-secondary px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-secondary/20 transition-all"
            >
              <QrCode size={16} /> ดูตัวอย่างหน้าคิว →
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
