import React, { useState } from 'react';
import { MonitorDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { useInstall } from '../lib/pwa';

/** ปุ่มติดตั้งเป็นแอป (PWA): Chrome/Edge กดติดตั้งได้เลย · iPhone/iPad บอกวิธีเพิ่มลงหน้าจอหลัก · เปิดในแอปอยู่แล้วจะไม่แสดง */
export function InstallApp({ variant = 'light', collapsed = false }: { variant?: 'light' | 'dark'; collapsed?: boolean }) {
  const { installed, canInstall, ios, install } = useInstall();
  const [hint, setHint] = useState(false);
  if (installed || (!canInstall && !ios)) return null;

  const dark = variant === 'dark';
  return (
    <div>
      <button onClick={() => (canInstall ? install() : setHint(v => !v))} aria-label="ติดตั้งแอป SmashPang" title="ติดตั้งเป็นแอปบนเครื่องนี้"
        className={cn('w-full flex items-center rounded-xl transition-colors font-semibold',
          dark ? 'text-white/75 text-[15px] hover:bg-white/10' : 'text-primary bg-primary/5 hover:bg-primary/10 text-sm border border-primary/20',
          collapsed ? 'justify-center p-3.5' : 'gap-3.5 px-4 py-3')}>
        <MonitorDown size={20} className="shrink-0" />
        {!collapsed && <span>ติดตั้งแอปบนเครื่อง</span>}
      </button>
      {hint && !canInstall && (
        <p className={cn('mt-2 text-xs font-semibold leading-relaxed px-2', dark ? 'text-white/60' : 'text-gray-500')}>
          บน iPhone/iPad: แตะปุ่มแชร์ <b>⎋</b> ในเบราว์เซอร์ แล้วเลือก “เพิ่มลงในหน้าจอโฮม”
        </p>
      )}
    </div>
  );
}
