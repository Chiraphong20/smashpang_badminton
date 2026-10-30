import React from 'react';

// โครงหน้าแบบเว็บไซต์: ซ้ายเป็นแบรนด์ ขวาเป็นเนื้อหา — ใช้กับหน้าเข้าก๊วน / PIN / เข้าสู่ระบบ / สมัครสมาชิก
export const authField = 'w-full px-5 py-4 bg-white rounded-xl border-2 border-gray-200 text-gray-900 font-semibold placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition-all';
export const authPrimary = 'w-full py-4 bg-primary text-white rounded-xl font-headline font-black text-base disabled:opacity-40 hover:brightness-110 active:scale-[0.99] transition-all text-center';
export const authGhost = 'px-5 py-4 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-all';

interface Props {
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  children: React.ReactNode;
}

// ตัวบอกขั้นตอน: ● 1 รหัสก๊วน ── ○ 2 ยืนยัน PIN
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-3">
      {steps.map((label, i) => (
        <React.Fragment key={label}>
          {i > 0 && <div className="flex-1 h-px bg-gray-200" />}
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${i + 1 <= current ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>{i + 1}</span>
            <span className={`text-xs font-bold ${i + 1 === current ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

const HERO_CHIPS: [string, string][] = [['🏸', 'นับเกม'], ['♾️', 'บุฟเฟต์'], ['➗', 'หารเท่า'], ['🔀', 'สุ่มเพื่อน']];

export function AuthShell({ topLeft, topRight, children }: Props) {
  return (
    <div className="fixed inset-0 bg-white overflow-y-auto">
      <div className="min-h-full grid md:grid-cols-[6fr_5fr]">
        <aside className="hidden md:block p-4">
          <div className="relative h-full min-h-[calc(100vh-2rem)] rounded-3xl overflow-hidden bg-[#dff1fb]">
            <img src="/auth-hero.png" alt="SmashPang ชวนเพื่อนมาสนุกทั้งก๊วน" className="absolute inset-0 w-full h-full object-cover object-left" />
            <div className="absolute bottom-5 left-5 right-5 flex flex-wrap gap-2 justify-center">
              {HERO_CHIPS.map(([e, t]) => (
                <span key={t} className="px-4 py-2 rounded-xl bg-white/90 backdrop-blur text-sm font-black text-gray-800 shadow">{e} {t}</span>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex flex-col px-8 py-8 md:px-12 min-h-screen">
          <div className="flex items-center justify-between min-h-[2rem]">
            <div>{topLeft}</div>
            <div className="text-sm text-gray-500">{topRight}</div>
          </div>
          <div className="flex-1 flex items-center">
            <div className="w-full max-w-md mx-auto space-y-8 py-8">{children}</div>
          </div>
          <p className="text-center text-xs text-gray-400">© SmashPang</p>
        </main>
      </div>
    </div>
  );
}
