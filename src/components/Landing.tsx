import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Users, Wallet, Trophy, MonitorSmartphone, ListChecks, ClipboardPaste } from 'lucide-react';
import { Listing, fetchListings } from '../lib/api';
import { MODE_LABELS, MODE_THEME, SessionMode } from '../types';
import { GroupCard } from './FindGroups';

// หน้าแรกของเว็บ (landing page): แนะนำแอป + ก๊วนที่ใช้ระบบ
const MODES = Object.keys(MODE_LABELS) as SessionMode[];

const MODE_TAGLINE: Record<SessionMode, string> = {
  perGame: 'จับคู่ นับเกม คิดค่าคอร์ดและค่าลูกตามที่ตีจริง',
  buffet: 'ราคาเดียวตีกี่เกมก็ได้ ดูว่าใครตีไปกี่เกมเพื่อเฉลี่ยให้เท่ากัน',
  split: 'รวมค่าสนามกับค่าลูก แล้วหารเท่ากันทุกคนในคลิกเดียว',
  fun: 'สุ่มจับคู่เพื่อนตีสนุกๆ นับแต้ม ดูแพ้ชนะและอันดับ',
};

const FEATURES: [React.ElementType, string, string][] = [
  [ListChecks, 'จัดคอร์ทอัตโนมัติ', 'จับคู่ผู้เล่นตามระดับมือ จัดคิวต่อเนื่องไม่ต้องจดมือ'],
  [Wallet, 'คิดเงินครบจบในที่เดียว', 'ค่าคอร์ท ค่าลูก ค่าน้ำ ยอดค้างจ่าย และประวัติการชำระเงิน'],
  [Trophy, 'สถิติและอันดับ', 'แพ้-ชนะ จำนวนเกม เงินที่จ่าย ย้อนดูได้ตามวันและตามโหมด'],
  [ClipboardPaste, 'นำเข้ารายชื่อจาก LINE', 'วางข้อความลงชื่อจากกลุ่ม ระบบแยกชื่อและระดับมือให้'],
  [Users, 'จอคิวให้สมาชิกดู', 'เปิดจอคิวให้ทุกคนเห็นว่าถึงคิวใคร ไม่ต้องตะโกนเรียก'],
  [MonitorSmartphone, 'ใช้ได้บนคอม และ iPad', 'หน้าจอใหญ่ใช้สะดวกข้างสนาม ไม่ต้องติดตั้งแอป'],
];

export function Landing() {
  const [groups, setGroups] = useState<Listing[] | null>(null);
  const [mode, setMode] = useState<SessionMode>('perGame');
  const [picked, setPicked] = useState(false);  // เลือกเองแล้ว = หยุดสลับอัตโนมัติ
  const theme = MODE_THEME[mode];

  useEffect(() => {
    fetchListings({}).then(r => setGroups(r ? r.slice(0, 6) : []));
  }, []);

  // ทั้งหน้าเปลี่ยนสีตามตัวการ์ตูนที่เลือก (ใช้ธีมเดียวกับในแอป: [data-mode] ใน index.css)
  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    return () => { delete document.documentElement.dataset.mode; };
  }, [mode]);

  useEffect(() => {
    if (picked) return;
    const t = setInterval(() => setMode(m => MODES[(MODES.indexOf(m) + 1) % MODES.length]), 4500);
    return () => clearInterval(t);
  }, [picked]);

  const pick = (m: SessionMode) => { setPicked(true); setMode(m); };

  const base = window.location.pathname;

  return (
    <div className="min-h-screen bg-background text-gray-900 transition-colors duration-500">
      <nav className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-primary/10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href={base} className="font-headline font-black text-2xl text-primary">Smash<span className="text-primary-container">Pang</span></a>
          <div className="flex items-center gap-2 sm:gap-6 text-sm font-bold">
            <a href="#modes" className="hidden md:block text-gray-500 hover:text-gray-900">รูปแบบก๊วน</a>
            <a href="#features" className="hidden md:block text-gray-500 hover:text-gray-900">ฟีเจอร์</a>
            <a href="?find" className="text-gray-500 hover:text-gray-900">หาก๊วน</a>
            <a href="?account" className="text-gray-500 hover:text-gray-900">เจ้าของก๊วน</a>
            <a href="?join" className="px-5 py-2.5 rounded-xl bg-primary text-white hover:brightness-110">เข้าก๊วน</a>
          </div>
        </div>
      </nav>

      <header className="max-w-6xl mx-auto px-6 pt-12 pb-16 grid md:grid-cols-2 gap-10 items-center">
        <div className="space-y-6">
          <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-black">ระบบจัดก๊วนแบดมินตัน</span>
          <h1 className="font-headline font-black text-4xl md:text-6xl leading-tight">
            ชวนเพื่อนมา<br /><span className="text-primary">สนุกทั้งก๊วน!</span>
          </h1>
          <p className="text-lg text-gray-500 max-w-lg">
            จัดคอร์ท คิดเงิน นับเกม ดูอันดับ ครบในที่เดียว รองรับทุกรูปแบบก๊วน ไม่ว่าจะคิดตามเกม บุฟเฟต์ หารเท่า หรือสุ่มเพื่อนตีเฮฮา
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="?join" className="inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-primary text-white font-headline font-black hover:brightness-110">เข้าก๊วนของคุณ <ArrowRight size={18} /></a>
            <a href="?find" className="inline-flex items-center px-7 py-4 rounded-xl border-2 border-gray-200 font-headline font-black text-gray-700 hover:bg-gray-50">หาก๊วนตีแบด</a>
          </div>
          <p className="text-sm text-gray-400">เป็นเจ้าของก๊วน? <a href="?account" className="font-black text-primary hover:underline">สมัครสมาชิก / เข้าสู่ระบบ</a></p>
        </div>
        <div className="space-y-4">
          <div className="relative rounded-3xl overflow-hidden shadow-xl aspect-[6/5]" style={{ backgroundColor: theme.soft }}>
            <AnimatePresence mode="popLayout">
              <motion.img key={`${mode}-scene`} src={`/modes/${mode}-scene.jpg`} alt="" draggable={false}
                initial={{ opacity: 0 }} animate={{ opacity: 0.35 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
                className="absolute inset-0 w-full h-full object-cover" />
            </AnimatePresence>
            <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${theme.soft}cc, transparent 70%)` }} />
            <AnimatePresence mode="wait">
              <motion.img key={`${mode}-mascot`} src={`/modes/${mode}-mascot.webp`} alt={`ตัวการ์ตูนโหมด${MODE_LABELS[mode]}`} draggable={false}
                initial={{ opacity: 0, y: 24, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16, scale: 0.96 }} transition={{ duration: 0.35 }}
                className="absolute inset-0 m-auto h-[88%] w-auto max-w-[90%] object-contain drop-shadow-2xl" />
            </AnimatePresence>
            <span className="absolute left-4 top-4 px-4 py-1.5 rounded-full text-white text-sm font-black shadow-md" style={{ backgroundColor: theme.color }}>
              {theme.emoji} โหมด{MODE_LABELS[mode]}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {MODES.map(m => {
              const t = MODE_THEME[m];
              const on = m === mode;
              return (
                <button key={m} onClick={() => pick(m)} aria-pressed={on} aria-label={MODE_LABELS[m]}
                  className="rounded-2xl p-2 border-2 transition-all hover:-translate-y-0.5 hover:shadow-md"
                  style={{ borderColor: on ? t.color : 'transparent', backgroundColor: on ? t.soft : '#ffffffaa' }}>
                  <img src={`/modes/${m}-mascot.webp`} alt="" draggable={false} className="w-full aspect-square object-contain" />
                  <span className="block text-xs font-black text-center" style={{ color: t.color }}>{MODE_LABELS[m]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <section id="modes" className="py-16 transition-colors duration-500" style={{ backgroundColor: theme.soft }}>
        <div className="max-w-6xl mx-auto px-6 space-y-10">
          <div className="text-center space-y-2">
            <h2 className="font-headline font-black text-3xl md:text-4xl">เลือกรูปแบบก๊วนได้ 4 โหมด</h2>
            <p className="text-gray-500">เปลี่ยนโหมดได้ทุกวันที่เปิดก๊วน แต่ละโหมดมีสีและตัวการ์ตูนประจำตัว</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {MODES.map(m => {
              const t = MODE_THEME[m];
              const on = m === mode;
              return (
                <button key={m} onClick={() => pick(m)} aria-pressed={on}
                  className="text-left rounded-3xl overflow-hidden bg-white border-2 transition-all hover:-translate-y-1 hover:shadow-lg"
                  style={{ borderColor: on ? t.color : t.soft }}>
                  <div className="relative h-44 flex items-end justify-center" style={{ backgroundColor: t.soft }}>
                    <img src={`/modes/${m}-scene.jpg`} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover opacity-30" />
                    <img src={`/modes/${m}-mascot.webp`} alt={`ตัวการ์ตูนโหมด${MODE_LABELS[m]}`} draggable={false} className="relative h-40 w-auto object-contain drop-shadow-lg" />
                  </div>
                  <div className="p-5 space-y-2">
                    <h3 className="font-headline font-black text-2xl" style={{ color: t.color }}>{t.emoji} {MODE_LABELS[m]}</h3>
                    <p className="text-sm text-gray-500">{MODE_TAGLINE[m]}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section id="features" className="py-16">
        <div className="max-w-6xl mx-auto px-6 space-y-10">
          <div className="text-center space-y-2">
            <h2 className="font-headline font-black text-3xl md:text-4xl">ทำให้การจัดก๊วนง่ายขึ้น</h2>
            <p className="text-gray-500">เครื่องมือที่เจ้าของก๊วนต้องใช้ทุกครั้งที่ตี</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(([Icon, title, desc]) => (
              <div key={title} className="flex gap-4">
                <div className="w-12 h-12 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Icon size={22} /></div>
                <div>
                  <h3 className="font-black text-lg">{title}</h3>
                  <p className="text-sm text-gray-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="groups" className="py-16">
        <div className="max-w-6xl mx-auto px-6 space-y-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <h2 className="font-headline font-black text-3xl md:text-4xl">ก๊วนที่ใช้ SmashPang</h2>
              <p className="text-gray-500">ก๊วนที่เปิดรับสมาชิกอยู่ตอนนี้ ดูวัน เวลา สถานที่ และระดับมือที่รับ</p>
            </div>
            <a href="?find" className="inline-flex items-center gap-2 font-black text-primary hover:underline">ดูก๊วนทั้งหมด <ArrowRight size={16} /></a>
          </div>

          {groups === null && <p className="text-gray-400">กำลังโหลด...</p>}
          {groups && groups.length === 0 && (
            <div className="rounded-3xl bg-white border-2 border-dashed border-gray-200 py-14 text-center space-y-3">
              <p className="text-gray-500">ยังไม่มีก๊วนเปิดรับสมาชิก</p>
              <p className="text-sm text-gray-400">เจ้าของก๊วนเปิดประกาศได้ที่ ตั้งค่า → ประกาศหาสมาชิก ก๊วนของคุณจะมาแสดงตรงนี้</p>
            </div>
          )}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {groups?.map((g, i) => <GroupCard key={`${g.name}-${i}`} g={g} day={null} />)}
          </div>
        </div>
      </section>

      <section className="py-20 bg-primary text-on-primary transition-colors duration-500">
        <div className="max-w-3xl mx-auto px-6 text-center space-y-6">
          <div className="flex justify-center -space-x-2">
            {MODES.map(m => <img key={m} src={`/modes/${m}-mascot.webp`} alt="" draggable={false} className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-lg" />)}
          </div>
          <h2 className="font-headline font-black text-3xl md:text-4xl">พร้อมเปิดก๊วนของคุณหรือยัง?</h2>
          <p className="opacity-80">สมัครด้วยอีเมล + Username + รหัสผ่าน (ไม่ต้องยืนยันอีเมล) สร้างก๊วนด้วยรหัสกับ PIN แล้วตั้งชื่อและเลือกโหมดข้างในระบบได้เลย</p>
          <a href="?account" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-primary font-headline font-black hover:brightness-95">สมัครเป็นเจ้าของก๊วน <ArrowRight size={18} /></a>
        </div>
      </section>

      <footer className="border-t border-gray-100 py-8 text-center text-xs text-gray-400">© SmashPang</footer>
    </div>
  );
}
