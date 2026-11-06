import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { PlayerProfile, Rank, RANK_COLORS } from '../types';

// กดที่รูปโปรไฟล์เพื่อดูรูปใหญ่ (ใช้เฉพาะจุดที่เปิด zoom) — ส่งเหตุการณ์ให้ PhotoViewer ตัวเดียวที่ติดไว้ใน App แสดงผล
const openPhoto = (e: React.MouseEvent, src: string, name: string) => {
  e.stopPropagation();
  window.dispatchEvent(new CustomEvent('sp-photo', { detail: { src, name } }));
};

export function PhotoViewer() {
  const [photo, setPhoto] = useState<{ src: string; name: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setPhoto((e as CustomEvent).detail);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPhoto(null); };
    window.addEventListener('sp-photo', on);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('sp-photo', on); window.removeEventListener('keydown', key); };
  }, []);
  if (!photo) return null;
  return (
    <div className="fixed inset-0 z-[480] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-6" onClick={() => setPhoto(null)}>
      <img src={photo.src} alt={photo.name} draggable={false} className="w-[min(78vw,22rem)] aspect-square object-cover rounded-[2rem] bg-white shadow-2xl ring-4 ring-white/40" />
      <p className="text-white font-headline font-black text-2xl drop-shadow">{photo.name}</p>
      <p className="text-white/60 text-xs font-semibold">แตะที่ว่างเพื่อปิด</p>
    </div>
  );
}

// อักษรย่อ — ข้ามสระหน้า (เ แ โ ใ ไ) ภาษาไทยเอาตัวแรก ภาษาอังกฤษเอา 2 ตัว
export const initialOf = (name: string) => {
  const t = Array.from(name.trim().replace(/^[เแโใไ]+/, ''));
  if (t.length === 0) return '?';
  return /[A-Za-z]/.test(t[0]) ? t.slice(0, 2).join('').toUpperCase() : t[0];
};

// รูปโปรไฟล์ (ถ้ามี) หรือวงกลมอักษรย่อ
export function Avatar({ name, profile, className, textClass, zoom }: { name: string; profile?: PlayerProfile; className?: string; textClass?: string; zoom?: boolean }) {
  if (profile?.avatar) {
    const src = profile.avatar;
    return <img src={src} alt={name} draggable={false} onClick={zoom ? e => openPhoto(e, src, name) : undefined} className={cn('rounded-full object-cover shrink-0 bg-white', zoom && 'cursor-zoom-in', className)} />;
  }
  return (
    <div className={cn('rounded-full flex items-center justify-center font-headline font-black shrink-0 bg-primary/15 text-primary', className, textClass)}>
      {initialOf(name)}
    </div>
  );
}

// กล่องผู้เล่น: ถ้ามีรูปโปรไฟล์ แสดงรูปแทนกล่องระดับมือ (ระดับมือยังเห็นเป็นป้ายเล็กมุมขวาล่าง) · ไม่มีรูป = กล่องระดับมือเหมือนเดิม
// className ต้องมีขนาดและความโค้ง เช่น "w-10 h-10 rounded-xl"
export function PlayerBadge({ rank, name, profile, className, textClass, zoom }: { rank: Rank; name: string; profile?: PlayerProfile; className?: string; textClass?: string; zoom?: boolean }) {
  if (profile?.avatar) {
    const src = profile.avatar;
    return (
      <div className={cn('relative shrink-0', className)}>
        <img src={src} alt={name} draggable={false} onClick={zoom ? e => openPhoto(e, src, name) : undefined} className={cn('w-full h-full object-cover rounded-[inherit] bg-white', zoom && 'cursor-zoom-in')} />
        <span className={cn('absolute -bottom-1.5 -right-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-black leading-none ring-2 ring-white', RANK_COLORS[rank])}>{rank}</span>
      </div>
    );
  }
  return <div className={cn('flex items-center justify-center font-black shrink-0', className, RANK_COLORS[rank], textClass)}>{rank}</div>;
}
