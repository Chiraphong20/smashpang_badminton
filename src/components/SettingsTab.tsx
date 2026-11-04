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
  LogOut,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ListingEditor } from './ListingEditor';
import { HelpersManager } from './HelpersManager';
import { SignupManager } from './SignupManager';
import { ShareLink } from './ShareLink';
import { PromptPayQR } from './PromptPayQR';
import { parsePromptPayId } from '../lib/promptpay';
import type { PlanInfo } from '../lib/api';
import { Rank, SessionMode, ModeConfig, MODE_LABELS, MODE_THEME } from '../types';

const MODE_INFO: Record<SessionMode, string> = {
  perGame: 'ค่าคอร์ดครั้งเดียว + ค่าลูกคิดตามเกมที่ตี',
  buffet: 'ราคาเดียว ตีกี่เกมก็ได้ — ดูจำนวนเกมของแต่ละคนเพื่อเฉลี่ยให้เท่ากัน',
  split: 'รวมค่าสนาม + ค่าลูก แล้วหารเท่าตามจำนวนคนที่ได้ตี (กดเรียกเก็บในแท็บสถิติ)',
  fun: 'ตีเฮฮา ไม่คิดเงิน บันทึกแพ้/ชนะ/เสมอ ดูอันดับ',
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
  onLogout: () => void;
  onSwitchGroup: () => void;
  plan?: PlanInfo | null;
  /** ผู้ช่วย: ซ่อนส่วนที่เป็นของเจ้าของก๊วน (แพ็กเกจ พร้อมเพย์ ประกาศ ล้างข้อมูล) */
  isHelper?: boolean;
  groupName?: string;
  onRename?: (name: string, slot: null) => Promise<boolean>;
  onImportSignups?: (names: string[]) => void;
  promptPay?: { id: string; name: string };
  onChangePromptPay?: (v: { id: string; name: string }) => void;
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
  rankMemory, onLogout, onSwitchGroup, plan, isHelper, groupName = '', onRename, onImportSignups, promptPay, onChangePromptPay, queueUrl,
  sessionMode, setSessionMode, modeConfig, setModeConfig
}: Props) {
  const [nameDraft, setNameDraft] = useState(groupName);
  // หมวดตั้งค่า (จำหมวดล่าสุดในเครื่องนี้)
  type Cat = 'general' | 'money' | 'queue' | 'listing' | 'system';
  const allCats: { id: Cat; icon: string; label: string; desc: string; ownerOnly?: boolean }[] = [
    { id: 'general', icon: '🏠', label: 'ก๊วนและบัญชี', desc: 'ชื่อก๊วน · แพ็กเกจ · ผู้ช่วย · ออกจากระบบ/เปลี่ยนก๊วน' },
    { id: 'money', icon: '💰', label: 'การเงินและโหมด', desc: 'รูปแบบการจัดก๊วน · ค่าสนาม/ค่าลูก · ถามผลแพ้ชนะ · พร้อมเพย์รับเงิน' },
    { id: 'queue', icon: '📝', label: 'ลงชื่อและคิว', desc: 'ลิงก์ลงชื่อล่วงหน้า · QR/ลิงก์ให้ผู้เล่นดูคิวสด' },
    { id: 'listing', icon: '📣', label: 'หาสมาชิก', desc: 'ประกาศก๊วนบนหน้า "หาก๊วน" · โปสเตอร์ · วัน-เวลา · สถานที่', ownerOnly: true },
    { id: 'system', icon: '🛠️', label: 'ระบบ', desc: 'ข้อมูลจำลอง · เริ่มวันใหม่ · ล้างข้อมูลทั้งหมด (ระวัง)', ownerOnly: true },
  ];
  const cats = allCats.filter(c => !c.ownerOnly || !isHelper);
  const [cat, setCat] = useState<Cat>(() => {
    try { const v = localStorage.getItem('sp_settings_cat') as Cat | null; if (v && allCats.some(c => c.id === v)) return v; } catch { /* ignore */ }
    return 'general';
  });
  const curCat: Cat = cats.some(c => c.id === cat) ? cat : 'general';
  const pickCat = (c: Cat) => { setCat(c); try { localStorage.setItem('sp_settings_cat', c); } catch { /* ignore */ } };
  const [nameMsg, setNameMsg] = useState('');
  const saveName = async () => {
    const n = nameDraft.trim();
    if (!n || !onRename || n === groupName) return;
    setNameMsg((await onRename(n, null)) ? 'บันทึกชื่อแล้ว' : 'บันทึกไม่สำเร็จ');
    setTimeout(() => setNameMsg(''), 2000);
  };
  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-20">
      <div className="flex items-center gap-4 mb-4 sm:mb-8">
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
          <Settings size={24} className="text-primary" />
        </div>
        <div>
          <h2 className="font-headline font-black text-2xl text-on-surface">ตั้งค่า</h2>
          <p className="text-xs text-on-surface/40 font-bold uppercase tracking-widest">System Configuration & Maintenance</p>
        </div>
      </div>



      {/* หมวดตั้งค่า: แท็บเลือกดูทีละกลุ่ม */}
      <nav className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-background/95 backdrop-blur flex gap-2 overflow-x-auto no-scrollbar" aria-label="หมวดตั้งค่า">
        {cats.map(c => (
          <button key={c.id} onClick={() => pickCat(c.id)}
            className={cn('shrink-0 px-4 py-2.5 rounded-2xl text-sm font-black border-2 transition-all whitespace-nowrap',
              curCat === c.id ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-on-surface/60 border-on-surface/10 hover:border-primary/40')}>
            <span className="mr-1.5">{c.icon}</span>{c.label}
          </button>
        ))}
      </nav>
      <div className="rounded-2xl bg-primary/5 px-4 py-3 -mt-3">
        <p className="text-sm font-black text-primary">{cats.find(c => c.id === curCat)?.icon} {cats.find(c => c.id === curCat)?.label}</p>
        <p className="text-xs font-semibold text-on-surface/55">{cats.find(c => c.id === curCat)?.desc}</p>
      </div>

      {/* 1) ก๊วนและบัญชี */}
      {curCat === 'general' && (
        <div className="space-y-8">
      {/* บัญชี: ออกจากระบบ / เปลี่ยนก๊วน */}
      <section className="bg-white rounded-[2rem] p-4 sm:p-5 shadow-sm border border-on-surface/5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-headline font-black text-base">บัญชีของคุณ</p>
          <p className="text-xs font-semibold text-on-surface/50">ออกจากระบบเมื่อใช้เครื่องร่วมกับคนอื่น</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onSwitchGroup} className="flex-1 sm:flex-none px-4 py-3 bg-background rounded-xl text-sm font-black text-on-surface/70 hover:bg-on-surface/10 transition-all whitespace-nowrap">เปลี่ยนก๊วน</button>
          <button onClick={onLogout} className="flex-1 sm:flex-none px-4 py-3 bg-red-50 border-2 border-red-200 text-red-600 rounded-xl text-sm font-black hover:bg-red-100 transition-all whitespace-nowrap flex items-center justify-center gap-2">
            <LogOut size={16} /> ออกจากระบบ
          </button>
        </div>
      </section>

      {onRename && !isHelper && (
        <section className="bg-white rounded-[2rem] p-4 sm:p-5 shadow-sm border border-on-surface/5 space-y-3">
          <p className="font-headline font-black text-base">ชื่อก๊วน</p>
          <div className="flex gap-2">
            <input value={nameDraft} maxLength={100} onChange={e => setNameDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName()}
              className="flex-1 min-w-0 px-4 py-3 bg-background rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-primary/25" />
            <button onClick={saveName} disabled={!nameDraft.trim() || nameDraft.trim() === groupName} className="px-5 py-3 rounded-xl bg-primary text-white font-black text-sm disabled:opacity-40">บันทึก</button>
          </div>
          {nameMsg && <p className="text-xs font-bold text-emerald-600">{nameMsg}</p>}
        </section>
      )}

      {plan && !isHelper && (
        <section className="bg-white rounded-[2rem] p-4 sm:p-5 shadow-sm border border-on-surface/5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-headline font-black text-base">แพ็กเกจ: {plan.plan.name}</p>
            {plan.plan.price && <span className="text-xs font-bold text-on-surface/45">{plan.plan.price}</span>}
            {plan.expiresAt && (
              <span className={`text-xs font-black px-2.5 py-1 rounded-full ${plan.expired ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                {plan.expired ? 'หมดอายุแล้ว' : 'หมดอายุ ' + new Date(plan.expiresAt).toLocaleDateString('th-TH')}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {([
              ['ผู้เล่นต่อครั้ง', plan.plan.maxPlayers == null ? 'ไม่จำกัด' : `สูงสุด ${plan.plan.maxPlayers} คน`],
              ['จัดก๊วนเดือนนี้', plan.plan.maxSessionsMonth == null ? `${plan.usage.sessionsThisMonth} ครั้ง` : `${plan.usage.sessionsThisMonth}/${plan.plan.maxSessionsMonth} ครั้ง`],
              ['โหมดที่ใช้ได้', `${plan.plan.modes.length}/4 โหมด`],
              ['จำนวนก๊วน', plan.plan.maxGroups == null ? `${plan.usage.groups} ก๊วน` : `${plan.usage.groups}/${plan.plan.maxGroups} ก๊วน`],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} className="rounded-xl bg-background py-2.5 px-2">
                <p className="text-[10px] font-bold text-on-surface/45">{l}</p>
                <p className="font-black text-sm">{v}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isHelper && <HelpersManager />}

        </div>
      )}

      {/* 2) การเงินและโหมด */}
      {curCat === 'money' && (
        <div className="space-y-8">
      {/* Session Mode */}
      <section className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 shadow-sm border border-on-surface/5 space-y-5">
        <h3 className="text-sm font-black uppercase tracking-widest text-on-surface/40">รูปแบบการจัดก๊วน</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(Object.keys(MODE_LABELS) as SessionMode[]).map(m => (
            <button key={m} onClick={() => setSessionMode(m)} disabled={!!plan && !plan.plan.modes.includes(m)} title={plan && !plan.plan.modes.includes(m) ? 'แพ็กเกจของคุณยังไม่รองรับโหมดนี้' : undefined}
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
            ถามผลทุกครั้งที่จบเกม (ทีมไหนชนะ หรือเสมอ) เพื่อเก็บสถิติแพ้/ชนะ
          </label>
        )}
      </section>

      <div className="grid grid-cols-1 gap-8">
        {/* Pricing Section */}
        <section className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 shadow-sm border border-on-surface/5 space-y-6">
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

      {onChangePromptPay && !isHelper && (
        <section className="bg-white rounded-[2rem] p-4 sm:p-6 shadow-sm border border-on-surface/5 space-y-4">
          <div>
            <h3 className="font-headline font-black text-lg flex items-center gap-2">📱 พร้อมเพย์รับเงิน</h3>
            <p className="text-xs font-semibold text-on-surface/50">ตั้งครั้งเดียว แล้วหน้าเก็บเงินจะแสดง QR ที่ล็อกยอดให้ลูกค้าสแกนจ่ายได้เลย (QR สร้างในเครื่อง ไม่ส่งเลขของคุณให้บริการภายนอก)</p>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-bold text-on-surface/50">เบอร์มือถือ / เลขบัตรประชาชน / เลขผู้เสียภาษี</span>
              <input value={promptPay?.id || ''} inputMode="numeric" maxLength={20} placeholder="เช่น 081-234-5678"
                onChange={e => onChangePromptPay({ id: e.target.value.replace(/[^\d-]/g, ''), name: promptPay?.name || '' })}
                className="w-full px-4 py-3 bg-background rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-primary/25" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-on-surface/50">ชื่อบัญชีที่แสดงใต้ QR (ไม่บังคับ)</span>
              <input value={promptPay?.name || ''} maxLength={40} placeholder="เช่น ก๊วนแบดวันอังคาร"
                onChange={e => onChangePromptPay({ id: promptPay?.id || '', name: e.target.value })}
                className="w-full px-4 py-3 bg-background rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-primary/25" />
            </label>
          </div>
          {promptPay?.id && !parsePromptPayId(promptPay.id) && <p className="text-xs font-bold text-red-500">เลขไม่ถูกต้อง — ใช้เบอร์มือถือ 10 หลัก (ขึ้นต้น 06/08/09) หรือเลข 13 หลัก</p>}
          {promptPay?.id && parsePromptPayId(promptPay.id) && (
            <div className="flex flex-wrap items-center gap-4">
              <PromptPayQR id={promptPay.id} name={promptPay.name} size={150} />
              <p className="text-xs font-semibold text-on-surface/50 max-w-xs">ตัวอย่าง QR (ยังไม่ล็อกยอด) · ลองสแกนด้วยแอปธนาคารเพื่อตรวจว่าชื่อบัญชีตรงกับของคุณ · ตอนเก็บเงินจะล็อกยอดต่อคนให้อัตโนมัติ</p>
            </div>
          )}
          {promptPay?.id && <button onClick={() => onChangePromptPay({ id: '', name: '' })} className="text-xs font-bold text-on-surface/40 hover:text-red-500">ล้างข้อมูลพร้อมเพย์</button>}
        </section>
      )}

        </div>
      )}

      {/* 3) ลงชื่อและคิว */}
      {curCat === 'queue' && (
        <div className="space-y-8">
      {onImportSignups && <SignupManager maxPlayers={plan?.plan.maxPlayers} onImport={onImportSignups} />}

      {/* QR Code Section */}
      <section className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 shadow-sm border border-on-surface/5">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-secondary/10 rounded-2xl flex items-center justify-center">
            <QrCode size={20} className="text-secondary" />
          </div>
          <div>
            <h3 className="font-bold text-base text-on-surface">QR Code — หน้าคิวสำหรับลูกค้า</h3>
            <p className="text-xs text-on-surface/45 font-semibold">ลูกค้าสแกนเพื่อดูคิวรอและสนามที่กำลังตีอยู่</p>
          </div>
        </div>

        <ShareLink url={queueUrl} title={groupName || 'คิวแบดมินตัน'} caption="สแกนดูคิวและสนาม" filename="queue-qrcode.png" size={190} />

        <div className="mt-5 space-y-1.5 text-sm text-on-surface/50">
          <p className="font-semibold">✅ แสดงทุกสนาม คิวถัดไป และรายชื่อคนที่รอลงสนาม · ค้นหาชื่อตัวเองได้</p>
          <p className="font-semibold">✅ อัปเดตอัตโนมัติทุก 20 วินาที · ไม่ต้องล็อกอิน ดูได้ทุกคน</p>
        </div>
      </section>
        </div>
      )}

      {/* 4) หาสมาชิก */}
      {curCat === 'listing' && !isHelper && (
        <div className="space-y-8">
      {!isHelper && <ListingEditor />}

        </div>
      )}

      {/* 5) ระบบ */}
      {curCat === 'system' && !isHelper && (
        <div className="space-y-8">
      {/* System Maintenance Section */}
      {!isHelper && <section className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 shadow-sm border border-on-surface/5 space-y-6">
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
      </section>}

        </div>
      )}
    </div>
  );
}
