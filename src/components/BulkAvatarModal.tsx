import React, { useEffect, useRef, useState } from 'react';
import { X, ImagePlus, Link2, Trash2, Check, Clipboard } from 'lucide-react';
import { cn } from '../lib/utils';
import { Member, PlayerProfile } from '../types';
import { resizeToAvatar, urlToAvatar, readPasted } from '../lib/image';

interface Item { key: string; avatar: string; label: string; memberId: string }

interface Props {
  members: Member[];
  profiles: Record<string, PlayerProfile>;
  onSave: (entries: { id: string; avatar: string }[]) => void;
  onClose: () => void;
}

const norm = (s: string) => s.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_\-.]+/g, ' ').trim().toLowerCase();

// เพิ่มรูปโปรไฟล์ทีเดียวหลายคน: เลือก/ลากหลายไฟล์, วางรูปที่คัดลอกมา (Ctrl+V), หรือวางลิงก์รูป แล้วเลือกว่ารูปไหนเป็นของใคร
// ชื่อไฟล์ตรงกับชื่อ/ชื่อเล่นของสมาชิก (เช่น "ปอ.jpg") จะจับคู่ให้อัตโนมัติ
export function BulkAvatarModal({ members, profiles, onSave, onClose }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [links, setLinks] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const membersRef = useRef(members);
  membersRef.current = members;

  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, 'th'));

  // จับคู่ชื่อไฟล์กับสมาชิกที่ยังไม่ถูกเลือกในรายการอื่น
  const guess = (label: string, taken: Set<string>): string => {
    const l = norm(label);
    if (!l) return '';
    const free = membersRef.current.filter(m => !taken.has(m.id));
    const exact = free.filter(m => norm(m.name) === l || (profiles[m.id]?.nickname && norm(profiles[m.id]!.nickname!) === l));
    if (exact.length === 1) return exact[0].id;
    const part = free.filter(m => m.name.trim().length >= 2 && l.includes(m.name.trim().toLowerCase()));
    return part.length === 1 ? part[0].id : '';
  };

  const addAvatars = (list: { avatar: string; label: string }[]) => {
    setItems(prev => {
      const taken = new Set(prev.map(i => i.memberId).filter(Boolean));
      const next = [...prev];
      for (const a of list) {
        const id = guess(a.label, taken);
        if (id) taken.add(id);
        next.push({ key: 'i' + (++seq.current), avatar: a.avatar, label: a.label, memberId: id });
      }
      return next;
    });
  };

  const addFiles = async (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith('image/'));
    if (!imgs.length) { setErrors(e => [...e, 'ไม่พบไฟล์รูปภาพ']); return; }
    setBusy(b => b + imgs.length);
    const ok: { avatar: string; label: string }[] = [];
    let bad = 0;
    for (const f of imgs) {
      try { ok.push({ avatar: await resizeToAvatar(f), label: f.name || 'รูปที่วาง' }); } catch { bad++; }
      setBusy(b => b - 1);
    }
    if (ok.length) addAvatars(ok);
    if (bad) setErrors(e => [...e, `อ่านรูปไม่ได้ ${bad} ไฟล์`]);
  };

  const addUrls = async (urls: string[]) => {
    if (!urls.length) return;
    setBusy(b => b + urls.length);
    const ok: { avatar: string; label: string }[] = [];
    const failed: string[] = [];
    await Promise.all(urls.map(async u => {
      try { ok.push({ avatar: await urlToAvatar(u), label: decodeURIComponent(u.split('?')[0].split('/').pop() || 'รูปจากลิงก์') }); }
      catch { failed.push(u); }
      setBusy(b => b - 1);
    }));
    if (ok.length) addAvatars(ok);
    if (failed.length) setErrors(e => [...e, `ดึงรูปจากลิงก์ไม่ได้ ${failed.length} ลิงก์ (เว็บนั้นไม่อนุญาตให้ดึงรูป) — ลองกด "คัดลอกรูป" แล้ววาง หรือบันทึกรูปแล้วอัปโหลดแทน`]);
  };

  // วางรูปที่คัดลอกมา / ลิงก์ ได้ทุกที่ในหน้าต่างนี้ (ยกเว้นตอนพิมพ์ในช่องวางลิงก์ซึ่งจัดการเอง)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const { files, urls } = readPasted(e.clipboardData);
      if (files.length) { e.preventDefault(); addFiles(files); }
      else if (urls.length) { e.preventDefault(); addUrls(urls); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('paste', onPaste); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const pasteFromButton = async () => {
    try {
      const cb = await navigator.clipboard.read();
      const files: File[] = [];
      for (const it of cb) for (const t of it.types) if (t.startsWith('image/')) files.push(new File([await it.getType(t)], 'รูปที่วาง', { type: t }));
      if (files.length) { addFiles(files); return; }
      const text = (await navigator.clipboard.readText()).split('\n').map(x => x.trim()).filter(x => /^https?:\/\/\S+$/i.test(x));
      if (text.length) { addUrls(text); return; }
      setErrors(e => [...e, 'ไม่มีรูปหรือลิงก์รูปในคลิปบอร์ด']);
    } catch { setErrors(e => [...e, 'เบราว์เซอร์ไม่อนุญาตให้อ่านคลิปบอร์ด — กด Ctrl+V (หรือกดค้างแล้วเลือก "วาง") ในหน้าต่างนี้แทน']); }
  };

  const setMember = (key: string, memberId: string) => setItems(prev => prev.map(i => i.key === key ? { ...i, memberId } : i));
  const assigned = items.filter(i => i.memberId);
  const takenBy = new Map(items.filter(i => i.memberId).map(i => [i.memberId, i.key]));

  return (
    <div className="fixed inset-0 z-[400] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-5 sm:p-6 pb-3 flex items-start gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="font-headline font-black text-xl">เพิ่มรูปโปรไฟล์หลายคน</h3>
            <p className="text-xs font-semibold text-on-surface/50">เลือกหลายรูปพร้อมกัน แล้วเลือกว่าแต่ละรูปเป็นของใคร · ตั้งชื่อไฟล์ตรงกับชื่อสมาชิก ระบบจับคู่ให้เอง</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-background hover:bg-on-surface/10 flex items-center justify-center shrink-0" aria-label="ปิด"><X size={18} /></button>
        </div>

        <div className="px-5 sm:px-6 space-y-3 overflow-y-auto flex-1 min-h-0 pb-3">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const { files, urls } = readPasted(e.dataTransfer); if (files.length) addFiles(files); else if (urls.length) addUrls(urls); }}
            className={cn('rounded-2xl border-2 border-dashed p-4 text-center space-y-3 transition-colors', dragOver ? 'border-primary bg-primary/5' : 'border-on-surface/15 bg-background')}>
            <p className="text-sm font-bold text-on-surface/60">ลากรูปมาวางที่นี่ หรือ</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white font-black text-sm"><ImagePlus size={16} /> เลือกรูปจากเครื่อง (หลายรูปได้)</button>
              <button onClick={pasteFromButton} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-on-surface/10 font-black text-sm text-primary"><Clipboard size={16} /> วางรูปที่คัดลอกไว้</button>
            </div>
            <p className="text-[11px] font-semibold text-on-surface/40">คัดลอกรูปจากแชท/เว็บ แล้วกด Ctrl+V ในหน้าต่างนี้ได้เลย (มือถือกดค้างแล้วเลือก “วาง”)</p>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
          </div>

          <div className="rounded-2xl bg-background p-3 space-y-2">
            <label className="text-xs font-bold text-on-surface/50 flex items-center gap-1.5"><Link2 size={13} /> หรือวางลิงก์รูป (หลายลิงก์ได้ บรรทัดละลิงก์)</label>
            <textarea value={links} onChange={e => setLinks(e.target.value)} rows={2} placeholder="https://.../รูป.jpg"
              className="w-full px-3 py-2 rounded-xl bg-white border border-on-surface/10 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 resize-none" />
            <button disabled={!links.trim()} onClick={() => { const u = links.split('\n').map(x => x.trim()).filter(x => /^https?:\/\/\S+$/i.test(x)); if (!u.length) setErrors(e => [...e, 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://']); else { addUrls(u); setLinks(''); } }}
              className="px-4 py-2 rounded-xl bg-primary/10 text-primary font-black text-xs disabled:opacity-40">เพิ่มจากลิงก์</button>
          </div>

          {errors.map((er, i) => <p key={i} className="text-xs font-bold text-red-500">{er}</p>)}
          {busy > 0 && <p className="text-xs font-bold text-on-surface/50">กำลังอ่านรูป {busy} รูป…</p>}

          {items.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-black text-on-surface/50">{items.length} รูป · จับคู่แล้ว {assigned.length}{items.length - assigned.length > 0 ? ` · ยังไม่เลือกคน ${items.length - assigned.length}` : ''}</p>
              {items.map(it => (
                <div key={it.key} className={cn('flex items-center gap-3 rounded-2xl p-2.5 border', it.memberId ? 'border-primary/30 bg-primary/5' : 'border-on-surface/10 bg-white')}>
                  <img src={it.avatar} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-[11px] font-semibold text-on-surface/40 truncate">{it.label}</p>
                    <select value={it.memberId} onChange={e => setMember(it.key, e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-on-surface/10 font-bold text-sm">
                      <option value="">— เลือกว่าเป็นรูปของใคร —</option>
                      {sorted.map(m => (
                        <option key={m.id} value={m.id} disabled={takenBy.has(m.id) && takenBy.get(m.id) !== it.key}>
                          {m.name}{profiles[m.id]?.avatar ? ' (มีรูปแล้ว จะแทนที่)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button onClick={() => setItems(prev => prev.filter(x => x.key !== it.key))} className="p-2 text-on-surface/30 hover:text-error shrink-0" aria-label="เอารูปนี้ออก"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 sm:p-6 pt-3 flex gap-2 shrink-0 border-t border-on-surface/5">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-background font-black text-sm text-on-surface/60">ยกเลิก</button>
          <button disabled={!assigned.length} onClick={() => { onSave(assigned.map(i => ({ id: i.memberId, avatar: i.avatar }))); onClose(); }}
            className="flex-[2] py-3 rounded-xl bg-primary text-white font-black text-sm disabled:opacity-40 flex items-center justify-center gap-2">
            <Check size={16} /> บันทึก {assigned.length ? `${assigned.length} รูป` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
