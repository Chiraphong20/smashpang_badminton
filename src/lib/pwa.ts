import { useEffect, useState } from 'react';

// ลงทะเบียน service worker (เฉพาะตอนใช้งานจริง ไม่รบกวนตอนพัฒนา)
export function registerSW() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* ไม่รองรับ/ถูกบล็อก ก็ใช้เว็บปกติ */ }); });
}

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as BIPEvent; listeners.forEach(l => l()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach(l => l()); });
}

const isStandalone = () => {
  try { return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true; } catch { return false; }
};
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** สถานะการติดตั้งเป็นแอป: installed = เปิดอยู่ในแอปแล้ว · canInstall = กดติดตั้งได้ทันที · ios = ต้องทำเองผ่านเมนูแชร์ */
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force(n => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const installed = isStandalone();
  return {
    installed,
    canInstall: !!deferred && !installed,
    ios: !installed && isIOS(),
    install: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null; listeners.forEach(l => l());
    },
  };
}
