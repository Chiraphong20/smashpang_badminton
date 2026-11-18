// SmashPang service worker — ทำให้ติดตั้งเป็นแอปบนเดสก์ท็อป/มือถือได้ และเปิดเร็วขึ้น
// หลักการ: ข้อมูลระบบ (/api) ไม่แคชเด็ดขาด · หน้าเว็บโหลดจากเน็ตก่อนเสมอ (ได้เวอร์ชันล่าสุด) · ไฟล์ static แคชไว้เปิดเร็ว
const VERSION = 'sp-v1';
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;       // ข้อมูลจริงต้องสดเสมอ
  if (req.headers.has('range') || /\.(mp4|webm|mov)$/i.test(url.pathname)) return; // วิดีโอ: ปล่อยให้เบราว์เซอร์จัดการ

  // เปิดหน้าเว็บ: เน็ตก่อน · ถ้าออฟไลน์ใช้หน้าที่เคยเปิดล่าสุด
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) { const c = await caches.open(PAGES); c.put('/__shell', res.clone()); }
        return res;
      } catch {
        const cached = await caches.match('/__shell');
        return cached || new Response('ออฟไลน์อยู่ — เชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // ไฟล์ static (js/css/รูป/ฟอนต์): ใช้ของเดิมก่อนแล้วอัปเดตเบื้องหลัง
  e.respondWith((async () => {
    const cache = await caches.open(STATIC);
    const hit = await cache.match(req);
    const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await fresh) || new Response('', { status: 504 });
  })());
});
