import React from 'react';

// ไอคอนลูกแบดมินตัน (หัวคอร์ก + ขนลูก) — ใช้แทน lucide icon ได้ (รับ size / className / style)
export function ShuttleIcon({ size = 24, className, style, strokeWidth = 2 }: { size?: number; className?: string; style?: React.CSSProperties; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      {/* ขนลูก */}
      <path d="M8.4 15.2 4.6 4.4C8.2 2.4 15.8 2.4 19.4 4.4l-3.8 10.8" />
      <path d="M10.2 15.2 8.6 3.6M13.8 15.2l1.6-11.6M12 15.2V3" />
      {/* แถบรัดขน */}
      <path d="M7.2 10.4h9.6" />
      {/* หัวคอร์ก */}
      <path d="M8.3 15.2h7.4v1.2a3.7 3.7 0 0 1-7.4 0z" />
    </svg>
  );
}
