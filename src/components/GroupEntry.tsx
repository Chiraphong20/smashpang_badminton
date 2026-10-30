import React, { useEffect, useState } from 'react';
import { AuthShell, authGhost, authPrimary } from './AuthShell';
import { AuthPage } from './AuthPage';
import { enterGroupAsOwner, getUserToken, clearUserToken, formatSlot, ListingSlot } from '../lib/api';

interface Props {
  gid: string;
  groupName: string;
  schedule: ListingSlot[];
  onEntered: () => void;
}

// เข้าก๊วนด้วยบัญชี (Username/อีเมล + รหัสผ่าน) เท่านั้น — ไม่มี PIN แล้ว
// ล็อกอินอยู่แล้ว → ตรวจสิทธิ์และเข้าให้เลย · ยังไม่ล็อกอิน → แสดงฟอร์มล็อกอิน · ไม่ใช่เจ้าของก๊วน → แจ้งและให้เปลี่ยนบัญชี
export function GroupEntry({ gid, groupName, schedule, onEntered }: Props) {
  const [state, setState] = useState<'checking' | 'login' | 'denied'>(() => (getUserToken() ? 'checking' : 'login'));

  const tryEnter = async () => {
    setState('checking');
    if (await enterGroupAsOwner(gid)) { onEntered(); return; }
    setState(getUserToken() ? 'denied' : 'login'); // token หมดอายุ/ไม่ถูกต้องจะถูกล้างอัตโนมัติ
  };

  useEffect(() => { if (getUserToken()) tryEnter(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'checking') {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse text-3xl">🏸</div>
        <p className="font-bold text-on-surface/50">กำลังเข้าก๊วน {groupName}...</p>
      </div>
    );
  }

  if (state === 'login') {
    return (
      <AuthPage
        notice={`เข้าสู่ระบบเพื่อเข้าก๊วน "${groupName}"${schedule.length ? ' · ' + schedule.map(formatSlot).join(' · ') : ''}`}
        onBack={() => { location.href = window.location.pathname; }}
        onDone={tryEnter}
      />
    );
  }

  return (
    <AuthShell topLeft={<a href={window.location.pathname} className="text-sm font-bold text-gray-500 hover:text-gray-900">← หน้าแรก</a>}>
      <div className="space-y-6 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 flex items-center justify-center text-3xl">🔒</div>
        <div className="space-y-2">
          <h2 className="font-headline font-black text-2xl text-gray-900">บัญชีนี้เข้าก๊วนนี้ไม่ได้</h2>
          <p className="text-gray-500 text-sm">ก๊วน "{groupName}" เข้าได้เฉพาะบัญชีของเจ้าของก๊วนเท่านั้น</p>
        </div>
        <div className="space-y-3">
          <button className={authPrimary} onClick={() => { clearUserToken(); setState('login'); }}>เข้าสู่ระบบด้วยบัญชีอื่น</button>
          <a href={window.location.pathname} className={`${authGhost} block`}>ไปที่ก๊วนของฉัน</a>
        </div>
      </div>
    </AuthShell>
  );
}
