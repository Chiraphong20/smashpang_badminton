import React from 'react';
import { cn } from '../lib/utils';
import { PlayerProfile, Rank, RANK_COLORS } from '../types';

// อักษรย่อ — ข้ามสระหน้า (เ แ โ ใ ไ) ภาษาไทยเอาตัวแรก ภาษาอังกฤษเอา 2 ตัว
export const initialOf = (name: string) => {
  const t = Array.from(name.trim().replace(/^[เแโใไ]+/, ''));
  if (t.length === 0) return '?';
  return /[A-Za-z]/.test(t[0]) ? t.slice(0, 2).join('').toUpperCase() : t[0];
};

// รูปโปรไฟล์ (ถ้ามี) หรือวงกลมอักษรย่อ
export function Avatar({ name, profile, className, textClass }: { name: string; profile?: PlayerProfile; className?: string; textClass?: string }) {
  if (profile?.avatar) {
    return <img src={profile.avatar} alt={name} draggable={false} className={cn('rounded-full object-cover shrink-0 bg-white', className)} />;
  }
  return (
    <div className={cn('rounded-full flex items-center justify-center font-headline font-black shrink-0 bg-primary/15 text-primary', className, textClass)}>
      {initialOf(name)}
    </div>
  );
}

// กล่องผู้เล่น: ถ้ามีรูปโปรไฟล์ แสดงรูปแทนกล่องระดับมือ (ระดับมือยังเห็นเป็นป้ายเล็กมุมขวาล่าง) · ไม่มีรูป = กล่องระดับมือเหมือนเดิม
// className ต้องมีขนาดและความโค้ง เช่น "w-10 h-10 rounded-xl"
export function PlayerBadge({ rank, name, profile, className, textClass }: { rank: Rank; name: string; profile?: PlayerProfile; className?: string; textClass?: string }) {
  if (profile?.avatar) {
    return (
      <div className={cn('relative shrink-0', className)}>
        <img src={profile.avatar} alt={name} draggable={false} className="w-full h-full object-cover rounded-[inherit] bg-white" />
        <span className={cn('absolute -bottom-1.5 -right-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-black leading-none ring-2 ring-white', RANK_COLORS[rank])}>{rank}</span>
      </div>
    );
  }
  return <div className={cn('flex items-center justify-center font-black shrink-0', className, RANK_COLORS[rank], textClass)}>{rank}</div>;
}
