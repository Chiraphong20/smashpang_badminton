import React from 'react';
import { cn } from '../lib/utils';
import { PlayerProfile } from '../types';

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
