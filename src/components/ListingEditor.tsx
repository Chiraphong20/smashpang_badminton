import React, { useEffect, useState } from 'react';
import { Megaphone, Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { apiFetch, apiJson, DAY_NAMES, ListingSlot } from '../lib/api';
import { RANKS } from '../types';

interface Form {
  listed: boolean;
  description: string;
  venue: string;
  area: string;
  mapUrl: string;
  schedule: ListingSlot[];
  levels: string[];
  price: string;
  contact: string;
}

const EMPTY: Form = { listed: false, description: '', venue: '', area: '', mapUrl: '', schedule: [], levels: [], price: '', contact: '' };

const ERRORS: Record<string, string> = {
  listing_incomplete: 'ต้องใส่สถานที่และวันเวลาอย่างน้อย 1 รายการก่อนเปิดประกาศ',
  invalid_listing: 'ข้อมูลไม่ถูกต้อง (ลิงก์แผนที่ต้องขึ้นต้นด้วย http:// หรือ https://)',
};

const input = 'w-full px-4 py-3 bg-surface-container rounded-xl font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30';

// ตั้งค่าประกาศหาสมาชิก — แสดงในหน้า "หาก๊วน" (/?find) เมื่อเปิดประกาศ
export function ListingEditor() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiFetch('/listing').then(async res => {
      if (res.ok) {
        const d = await res.json();
        setForm({ ...EMPTY, ...d, schedule: d.schedule ?? [], levels: d.levels ?? [] });
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));
  const setSlot = (i: number, patch: Partial<ListingSlot>) =>
    set('schedule', form.schedule.map((s, j) => j === i ? { ...s, ...patch } : s));
  const toggleLevel = (l: string) =>
    set('levels', form.levels.includes(l) ? form.levels.filter(x => x !== l) : [...form.levels, l]);

  const save = async () => {
    setBusy(true); setMessage(null);
    try {
      const res = await apiJson('/listing', form, 'PUT');
      if (res.ok) setMessage({ ok: true, text: form.listed ? 'บันทึกแล้ว — ก๊วนของคุณขึ้นในหน้าหาก๊วน' : 'บันทึกแล้ว (ยังไม่เปิดประกาศ)' });
      else {
        const d = await res.json().catch(() => ({}));
        setMessage({ ok: false, text: (d.error === 'plan_limit' && d.message) || ERRORS[d.error] || 'บันทึกไม่สำเร็จ' });
      }
    } catch {
      setMessage({ ok: false, text: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' });
    }
    setBusy(false);
  };

  if (!loaded) return null;

  return (
    <section className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 shadow-sm border border-on-surface/5 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-on-surface/40"><Megaphone size={16} /> ประกาศหาสมาชิก</h3>
        <label className="flex items-center gap-2 cursor-pointer font-bold text-sm">
          <input type="checkbox" className="w-5 h-5 accent-primary" checked={form.listed} onChange={e => set('listed', e.target.checked)} />
          เปิดประกาศ
        </label>
      </div>
      <p className="text-xs text-on-surface/50">แสดงในหน้า "หาก๊วน" ให้นักแบดที่อยากหาที่ตีค้นเจอ — ไม่เผยรหัสก๊วนหรือ PIN</p>

      <div className="grid md:grid-cols-2 gap-4">
        <input className={input} placeholder="สถานที่ เช่น สนามแบด ABC *" maxLength={150} value={form.venue} onChange={e => set('venue', e.target.value)} />
        <input className={input} placeholder="พื้นที่ เช่น ลาดพร้าว กรุงเทพฯ" maxLength={80} value={form.area} onChange={e => set('area', e.target.value)} />
        <input className={cn(input, 'md:col-span-2')} placeholder="ลิงก์แผนที่ (Google Maps) ไม่บังคับ" maxLength={300} value={form.mapUrl} onChange={e => set('mapUrl', e.target.value)} />
        <input className={input} placeholder="ค่าใช้จ่าย เช่น 150 บาท/คน" maxLength={100} value={form.price} onChange={e => set('price', e.target.value)} />
        <input className={input} placeholder="ช่องทางติดต่อ เช่น LINE: smash01 / 08x-xxx-xxxx" maxLength={200} value={form.contact} onChange={e => set('contact', e.target.value)} />
        <textarea className={cn(input, 'md:col-span-2 resize-none')} rows={2} placeholder="รายละเอียดเพิ่มเติม เช่น บรรยากาศก๊วน ลูกที่ใช้" maxLength={500} value={form.description} onChange={e => set('description', e.target.value)} />
      </div>

      <div className="space-y-3">
        <p className="text-xs font-black text-on-surface/50">วันและเวลาที่ตี * <span className="font-bold text-on-surface/30">(เว้นเวลาจบว่าง = "เป็นต้นไป")</span></p>
        {form.schedule.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select className={cn(input, 'w-auto')} value={s.day} onChange={e => setSlot(i, { day: Number(e.target.value) })}>
              {DAY_NAMES.map((d, n) => <option key={d} value={n}>{d}</option>)}
            </select>
            <input type="time" className={cn(input, 'w-auto')} value={s.start} onChange={e => setSlot(i, { start: e.target.value })} />
            <span className="font-bold text-on-surface/40">–</span>
            <input type="time" className={cn(input, 'w-auto')} value={s.end} onChange={e => setSlot(i, { end: e.target.value })} />
            <button onClick={() => set('schedule', form.schedule.filter((_, j) => j !== i))} className="p-2 text-on-surface/30 hover:text-error" aria-label="ลบ"><Trash2 size={18} /></button>
          </div>
        ))}
        {form.schedule.length < 7 && (
          <button onClick={() => set('schedule', [...form.schedule, { day: 1, start: '18:00', end: '21:00' }])}
            className="flex items-center gap-1 text-sm font-bold text-primary hover:underline"><Plus size={16} /> เพิ่มวัน</button>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-black text-on-surface/50">ระดับมือที่เปิดรับ (ไม่เลือก = รับทุกระดับ)</p>
        <div className="flex flex-wrap gap-2">
          {RANKS.map(l => (
            <button key={l} onClick={() => toggleLevel(l)}
              className={cn('px-3 py-1.5 rounded-lg text-sm font-black border-2 transition-all',
                form.levels.includes(l) ? 'bg-primary text-white border-primary' : 'border-on-surface/10 text-on-surface/60 hover:border-primary/40')}>{l}</button>
          ))}
        </div>
      </div>

      {message && <p className={cn('text-sm font-bold', message.ok ? 'text-tertiary' : 'text-error')}>{message.text}</p>}
      <button onClick={save} disabled={busy} className="px-8 py-3 bg-primary text-on-primary rounded-xl font-black disabled:opacity-40">{busy ? 'กำลังบันทึก...' : 'บันทึกประกาศ'}</button>
    </section>
  );
}
