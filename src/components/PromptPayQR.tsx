import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { promptPayPayload, maskPromptPayId } from '../lib/promptpay';

// QR พร้อมเพย์ (สร้างในเครื่อง) — ส่ง amount มาเพื่อล็อกยอดให้ผู้จ่ายสแกนแล้วไม่ต้องพิมพ์เอง
export function PromptPayQR({ id, name, amount, size = 220 }: { id: string; name?: string; amount?: number; size?: number }) {
  const [src, setSrc] = useState('');
  const payload = promptPayPayload(id, amount);

  useEffect(() => {
    let alive = true;
    if (!payload) { setSrc(''); return; }
    QRCode.toDataURL(payload, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#0b2a5b', light: '#ffffff' } })
      .then(u => { if (alive) setSrc(u); }).catch(() => { if (alive) setSrc(''); });
    return () => { alive = false; };
  }, [payload, size]);

  if (!payload) return <p className="text-sm font-bold text-red-500">เลขพร้อมเพย์ไม่ถูกต้อง</p>;
  return (
    <div className="inline-flex flex-col items-center gap-2 bg-white rounded-3xl p-4 border-2 border-sky-100 shadow-sm">
      <div className="px-4 py-1 rounded-full bg-[#1a4f9c] text-white text-xs font-black tracking-wide">PromptPay พร้อมเพย์</div>
      {src ? <img src={src} alt="QR พร้อมเพย์" data-promptpay-qr="1" draggable={false} style={{ width: size, height: size }} /> : <div style={{ width: size, height: size }} className="bg-background rounded-xl animate-pulse" />}
      {name && <p className="font-headline font-black text-base">{name}</p>}
      <p className="text-xs font-bold text-on-surface/45">{maskPromptPayId(id)}</p>
      {amount && amount > 0 ? <p className="font-headline font-black text-3xl text-[#1a4f9c]">฿{(Math.round(amount * 100) / 100).toLocaleString()}</p> : <p className="text-xs font-semibold text-on-surface/40">ผู้จ่ายกรอกยอดเอง</p>}
    </div>
  );
}
