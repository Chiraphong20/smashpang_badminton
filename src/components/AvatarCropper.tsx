import React, { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Check, RotateCcw } from 'lucide-react';

interface Props {
  /** รูปต้นฉบับ (data URL จาก toWorkingImage) */
  src: string;
  title?: string;
  onDone: (avatar: string) => void;
  onCancel: () => void;
}

const VIEW = 260;      // ขนาดกรอบครอป (px บนจอ)
const OUT = 160;       // ขนาดรูปที่บันทึก (px)
const MAX_ZOOM = 4;

// ขยับ (ลาก) และซูมรูปเพื่อกำหนดว่าจะให้ส่วนไหนของรูปเป็นรูปโปรไฟล์ แล้วบันทึกเป็น JPEG สี่เหลี่ยมจัตุรัสเล็ก ๆ
export function AvatarCropper({ src, title = 'ขยับและซูมรูป', onDone, onCancel }: Props) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // มุมซ้ายบนของรูปเทียบกับกรอบ
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const base = nat ? VIEW / Math.min(nat.w, nat.h) : 1;   // สเกลที่รูปพอดีเต็มกรอบพอดี
  const scale = base * zoom;
  const clamp = (x: number, y: number, s: number) => {
    if (!nat) return { x, y };
    const w = nat.w * s, h = nat.h * s;
    return { x: Math.min(0, Math.max(VIEW - w, x)), y: Math.min(0, Math.max(VIEW - h, y)) };
  };
  const center = (s: number) => nat ? clamp((VIEW - nat.w * s) / 2, (VIEW - nat.h * s) / 2, s) : { x: 0, y: 0 };

  useEffect(() => {
    const img = new Image();
    img.onload = () => { setNat({ w: img.width, h: img.height }); imgRef.current = img; };
    img.src = src;
  }, [src]);
  useEffect(() => { if (nat) setPos(center(base)); }, [nat]);   // เริ่มที่กึ่งกลางภาพ

  // ซูมโดยคงจุดกึ่งกลางกรอบไว้
  const setZoomAround = (z: number) => {
    const nz = Math.min(MAX_ZOOM, Math.max(1, z));
    const ns = base * nz;
    const cx = (VIEW / 2 - pos.x) / scale, cy = (VIEW / 2 - pos.y) / scale;   // จุดกลางกรอบในพิกัดรูป
    setZoom(nz);
    setPos(clamp(VIEW / 2 - cx * ns, VIEW / 2 - cy * ns, ns));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const apply = () => {
    const img = imgRef.current;
    if (!img || !nat) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, VIEW / scale, VIEW / scale, 0, 0, OUT, OUT);
    onDone(canvas.toDataURL('image/jpeg', 0.82));
  };

  return (
    <div className="fixed inset-0 z-[450] bg-black/60 flex items-end sm:items-center justify-center sm:p-4" onClick={e => { e.stopPropagation(); onCancel(); }}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl p-5 sm:p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-headline font-black text-lg">{title}</h3>
            <p className="text-xs font-semibold text-on-surface/50">ลากรูปเพื่อขยับ · เลื่อนแถบหรือหมุนล้อเมาส์เพื่อซูม</p>
          </div>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-background hover:bg-on-surface/10 flex items-center justify-center shrink-0" aria-label="ปิด"><X size={18} /></button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div
            className="relative overflow-hidden rounded-2xl bg-background touch-none select-none cursor-grab active:cursor-grabbing ring-2 ring-primary/30"
            style={{ width: VIEW, height: VIEW }}
            onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y }; }}
            onPointerMove={e => { const d = drag.current; if (d) setPos(clamp(d.ox + e.clientX - d.px, d.oy + e.clientY - d.py, scale)); }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
            onWheel={e => setZoomAround(zoom - e.deltaY * 0.002)}>
            {nat && (
              <img src={src} alt="" draggable={false} className="absolute max-w-none pointer-events-none"
                style={{ left: pos.x, top: pos.y, width: nat.w * scale, height: nat.h * scale }} />
            )}
            {/* วงกลมตัวอย่างว่าจะโชว์เป็นแบบไหน (รูปโปรไฟล์ในแอปบางจุดเป็นวงกลม) */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, transparent 0, transparent 68%, rgba(0,0,0,.28) 69%)' }} />
          </div>

          <div className="flex items-center gap-3 w-full max-w-[260px]">
            <ZoomOut size={16} className="text-on-surface/40 shrink-0" />
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={e => setZoomAround(Number(e.target.value))} className="flex-1 accent-primary" aria-label="ซูม" />
            <ZoomIn size={16} className="text-on-surface/40 shrink-0" />
          </div>

          <div className="flex items-center gap-3">
            <div className="text-center">
              <canvas ref={el => {
                if (!el || !imgRef.current || !nat) return;
                const c = el.getContext('2d'); if (!c) return;
                c.fillStyle = '#fff'; c.fillRect(0, 0, 56, 56);
                c.drawImage(imgRef.current, -pos.x / scale, -pos.y / scale, VIEW / scale, VIEW / scale, 0, 0, 56, 56);
              }} width={56} height={56} className="w-14 h-14 rounded-2xl ring-1 ring-on-surface/10" />
              <p className="text-[10px] font-bold text-on-surface/40 mt-1">สี่เหลี่ยม</p>
            </div>
            <div className="text-center">
              <canvas ref={el => {
                if (!el || !imgRef.current || !nat) return;
                const c = el.getContext('2d'); if (!c) return;
                c.fillStyle = '#fff'; c.fillRect(0, 0, 56, 56);
                c.drawImage(imgRef.current, -pos.x / scale, -pos.y / scale, VIEW / scale, VIEW / scale, 0, 0, 56, 56);
              }} width={56} height={56} className="w-14 h-14 rounded-full ring-1 ring-on-surface/10" />
              <p className="text-[10px] font-bold text-on-surface/40 mt-1">วงกลม</p>
            </div>
            <button onClick={() => { setZoom(1); setPos(center(base)); }} className="ml-2 inline-flex items-center gap-1.5 text-xs font-bold text-on-surface/50 hover:text-primary"><RotateCcw size={13} /> รีเซ็ต</button>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-background font-black text-sm text-on-surface/60">ยกเลิก</button>
          <button onClick={apply} disabled={!nat} className="flex-[2] py-3 rounded-xl bg-primary text-white font-black text-sm disabled:opacity-40 flex items-center justify-center gap-2"><Check size={16} /> ใช้รูปนี้</button>
        </div>
      </div>
    </div>
  );
}
