import React, { useState } from 'react';
import { X } from 'lucide-react';
import { PromptPayQR } from './PromptPayQR';
import { parsePromptPayId } from '../lib/promptpay';

type PP = { id: string; name: string };

// ป๊อปอัปสแกนจ่าย (ไม่ล็อกยอด) เปิดจากหน้าหลัก — ถ้ายังไม่ได้บันทึกพร้อมเพย์ให้กรอกก่อน
export function PromptPayModal({ promptPay, onChange, canEdit, onClose }: { promptPay?: PP; onChange?: (v: PP) => void; canEdit: boolean; onClose: () => void }) {
  const saved = !!promptPay?.id && !!parsePromptPayId(promptPay.id);
  const [editing, setEditing] = useState(!saved);
  const [id, setId] = useState(promptPay?.id || '');
  const [name, setName] = useState(promptPay?.name || '');
  const valid = !!parsePromptPayId(id);
  const field = 'w-full px-4 py-3 bg-background rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-primary/25';

  const save = () => {
    if (!valid || !onChange) return;
    onChange({ id, name: name.trim() });
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-sm bg-white rounded-[2rem] p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="ปิด" className="absolute top-4 right-4 p-2 rounded-full text-on-surface/40 hover:bg-background"><X size={18} /></button>
        <h3 className="font-headline font-black text-lg pr-8">📱 สแกนจ่ายพร้อมเพย์</h3>

        {!editing && saved ? (
          <div className="space-y-3 text-center">
            <PromptPayQR id={promptPay!.id} name={promptPay!.name} size={240} />
            <p className="text-xs font-semibold text-on-surface/45">QR นี้ให้ผู้จ่ายกรอกยอดเอง · ถ้าจะล็อกยอดต่อคน ให้เปิดบิลของคนนั้นแล้วกด "แสดง QR พร้อมเพย์"</p>
            {canEdit && <button onClick={() => setEditing(true)} className="text-xs font-black text-on-surface/50 underline">แก้ไขเลขพร้อมเพย์</button>}
          </div>
        ) : canEdit ? (
          <div className="space-y-3">
            {!saved && <p className="text-sm font-semibold text-on-surface/55">ยังไม่ได้ตั้งพร้อมเพย์รับเงิน กรอกแล้วบันทึก ครั้งเดียวใช้ได้ทุกครั้ง</p>}
            <label className="block space-y-1"><span className="text-xs font-bold text-on-surface/50">เบอร์มือถือ / เลขบัตรประชาชน / เลขผู้เสียภาษี</span>
              <input autoFocus value={id} inputMode="numeric" maxLength={20} placeholder="เช่น 081-234-5678" className={field}
                onChange={e => setId(e.target.value.replace(/[^\d-]/g, ''))} onKeyDown={e => e.key === 'Enter' && save()} /></label>
            <label className="block space-y-1"><span className="text-xs font-bold text-on-surface/50">ชื่อบัญชีที่แสดงใต้ QR (ไม่บังคับ)</span>
              <input value={name} maxLength={40} placeholder="เช่น ก๊วนแบดวันอังคาร" className={field} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} /></label>
            {id && !valid && <p className="text-xs font-bold text-red-500">เลขไม่ถูกต้อง — ใช้เบอร์มือถือ 10 หลัก (ขึ้นต้น 06/08/09) หรือเลข 13 หลัก</p>}
            <div className="flex gap-2">
              {saved && <button onClick={() => { setId(promptPay!.id); setName(promptPay!.name); setEditing(false); }} className="flex-1 py-3 rounded-xl bg-background font-black text-sm text-on-surface/60">ยกเลิก</button>}
              <button onClick={save} disabled={!valid} className="flex-1 py-3 rounded-xl bg-primary text-white font-black text-sm disabled:opacity-40">บันทึกและแสดง QR</button>
            </div>
          </div>
        ) : (
          <p className="text-sm font-semibold text-on-surface/55">ยังไม่ได้ตั้งพร้อมเพย์รับเงิน — ให้เจ้าของก๊วนตั้งที่ ตั้งค่า → พร้อมเพย์รับเงิน ก่อน</p>
        )}
      </div>
    </div>
  );
}
