import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Download, Share2, ExternalLink } from 'lucide-react';

// ลิงก์ + QR สำหรับแชร์: คัดลอกลิงก์ · บันทึก QR เป็นรูป PNG (มีชื่อ/คำอธิบายใต้ QR พร้อมพิมพ์หรือโพสต์) · แชร์ผ่านแอปในมือถือ
// QR สร้างในเครื่อง (ไม่ส่งลิงก์ไปบริการภายนอก) จึงบันทึกได้เสถียร
export function ShareLink({ url, title, caption, filename, size = 180 }: { url: string; title: string; caption?: string; filename: string; size?: number }) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof (navigator as Navigator & { share?: unknown }).share === 'function';

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#1b2a6b', light: '#ffffff' } })
      .then(u => { if (alive) setQr(u); }).catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, [url, size]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); }
    catch { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };

  // รูป PNG สำหรับโพสต์/พิมพ์: QR ขนาดใหญ่ + ชื่อ + คำอธิบาย
  const download = async () => {
    const big = await QRCode.toDataURL(url, { margin: 1, width: 720, errorCorrectionLevel: 'M', color: { dark: '#1b2a6b', light: '#ffffff' } });
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = big; });
    const W = 900, H = 1100;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); if (!g) return;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1b2a6b'; g.fillRect(0, 0, W, 130);
    g.fillStyle = '#ffffff'; g.font = 'bold 56px "Prompt", "Leelawadee UI", Tahoma, sans-serif'; g.textAlign = 'center';
    g.fillText('🏸 ' + title, W / 2, 85, W - 80);
    g.drawImage(img, (W - 720) / 2, 190, 720, 720);
    g.fillStyle = '#1b2a6b'; g.font = 'bold 44px "Prompt", "Leelawadee UI", Tahoma, sans-serif';
    if (caption) g.fillText(caption, W / 2, 985, W - 80);
    g.fillStyle = '#6b7280'; g.font = '28px "Prompt", "Leelawadee UI", Tahoma, sans-serif';
    g.fillText('SmashPang', W / 2, 1050);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png'); a.download = filename; a.click();
  };

  const share = async () => {
    try { await (navigator as Navigator & { share: (d: { title: string; url: string }) => Promise<void> }).share({ title, url }); } catch { /* ผู้ใช้ยกเลิก */ }
  };

  const btn = 'flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-black transition-all active:scale-95';
  return (
    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
      <div className="bg-white p-3 rounded-2xl border-2 border-on-surface/5 shadow-sm shrink-0">
        {qr ? <img src={qr} alt={`QR ${title}`} width={size} height={size} className="rounded-xl" /> : <div style={{ width: size, height: size }} className="bg-background rounded-xl animate-pulse" />}
      </div>
      <div className="w-full min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2 bg-background rounded-2xl px-3 py-2.5 min-w-0">
          <p className="text-xs sm:text-sm font-semibold text-on-surface/70 flex-1 min-w-0 truncate">{url}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={copy} className={`${btn} bg-primary text-white`}>{copied ? <><Check size={15} /> คัดลอกแล้ว</> : <><Copy size={15} /> คัดลอกลิงก์</>}</button>
          <button onClick={download} disabled={!qr} className={`${btn} bg-on-surface/5 text-on-surface/70 hover:bg-on-surface/10 disabled:opacity-40`}><Download size={15} /> บันทึก QR เป็นรูป</button>
          {canShare && <button onClick={share} className={`${btn} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}><Share2 size={15} /> แชร์</button>}
          <a href={url} target="_blank" rel="noopener noreferrer" className={`${btn} bg-secondary/10 text-secondary hover:bg-secondary/20`}><ExternalLink size={15} /> เปิดดู</a>
        </div>
      </div>
    </div>
  );
}
