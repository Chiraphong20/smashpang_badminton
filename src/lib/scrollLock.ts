// ล็อกการเลื่อนหน้าจอด้านหลังอัตโนมัติเมื่อมีหน้าต่างป๊อปอัป (modal / แผงเลือกที่เลื่อนจากล่าง) เปิดอยู่
// ใช้ MutationObserver ดูว่ามีองค์ประกอบ fixed ที่ z-index ≥ 80 อยู่ใน DOM ไหม จึงครอบคลุมทุกหน้าต่างทั้งแอป
// โดยไม่ต้องไล่แก้ทีละไฟล์ (แถบเมนูล่างใช้ z-50 จึงไม่ถูกนับ)
export function installScrollLock() {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  let raf = 0;
  const hasOverlay = () => {
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('[class*="fixed"][class*="z-["]'))) {
      const cls = el.className.toString();
      const m = /(?:^|[\s:])z-\[(\d+)\]/.exec(cls);
      if (!m || Number(m[1]) < 80) continue;
      if (getComputedStyle(el).position !== 'fixed') continue;
      // นับเฉพาะที่คลุมจอเป็นส่วนใหญ่ (modal / แผงล่าง) ไม่นับแถบแจ้งเตือนเล็กๆ ที่ลอยอยู่
      const r = el.getBoundingClientRect();
      if (r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.3) return true;
    }
    return false;
  };
  const sync = () => {
    raf = 0;
    html.classList.toggle('modal-open', hasOverlay());
  };
  new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(sync); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  sync();
}
