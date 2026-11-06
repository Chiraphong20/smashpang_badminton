// ย่อรูปที่ผู้ใช้เลือกให้เป็นสี่เหลี่ยมจัตุรัสเล็ก ๆ (ครอปกลางภาพ) แล้วคืนเป็น JPEG data URL
// ขนาดเล็ก (~3–6 KB) เพื่อไม่ให้ข้อมูลก๊วนบวม
export function resizeToAvatar(file: Blob, size = 128, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('not_image')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no_canvas')); return; }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load_failed')); };
    img.src = url;
  });
}

// ย่อโปสเตอร์ให้ด้านยาวไม่เกิน maxSide (คงสัดส่วน) แล้วคืนเป็น JPEG data URL (~80–250 KB)
export function resizeToPoster(file: File, maxSide = 960, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('not_image')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * k), h = Math.round(img.height * k);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no_canvas')); return; }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load_failed')); };
    img.src = url;
  });
}

// ดึงรูปจากลิงก์มาทำเป็นรูปโปรไฟล์ — ใช้ได้เฉพาะเว็บที่อนุญาตให้ดึงรูปข้ามเว็บ (CORS) ถ้าไม่ได้จะ reject
// (ให้ผู้ใช้คัดลอก "ตัวรูป" มาวาง หรือบันทึกรูปแล้วอัปโหลดแทน)
export function urlToAvatar(src: string, size = 128, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('timeout')), 15000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no_canvas')); return; }
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch { reject(new Error('blocked')); }
    };
    img.onerror = () => { clearTimeout(timer); reject(new Error('load_failed')); };
    img.src = src;
  });
}

// อ่านรูป (ที่คัดลอกมา) และ/หรือลิงก์รูป (http/https) จากเหตุการณ์วาง (Ctrl+V) หรือลากวาง
export function readPasted(dt: DataTransfer | null): { files: File[]; urls: string[] } {
  const files: File[] = [];
  const urls: string[] = [];
  if (!dt) return { files, urls };
  for (const f of Array.from(dt.files || [])) if (f.type.startsWith('image/')) files.push(f);
  if (!files.length) for (const it of Array.from(dt.items || [])) if (it.kind === 'file' && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) files.push(f); }
  const text = dt.getData('text/uri-list') || dt.getData('text/plain') || '';
  for (const line of text.split('\n')) { const t = line.trim(); if (/^https?:\/\/\S+$/i.test(t) && !urls.includes(t)) urls.push(t); }
  return { files, urls };
}

// ย่อรูปต้นฉบับให้ด้านยาวไม่เกิน maxSide (คงสัดส่วน) เพื่อใช้เป็นภาพตั้งต้นให้ผู้ใช้ขยับ/ซูมก่อนครอป
// รับได้ทั้งไฟล์และลิงก์ (ลิงก์ต้องเป็นเว็บที่อนุญาตให้ดึงรูปข้ามเว็บ)
export function toWorkingImage(src: Blob | string, maxSide = 720): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof src !== 'string' && !src.type.startsWith('image/')) { reject(new Error('not_image')); return; }
    const objUrl = typeof src === 'string' ? '' : URL.createObjectURL(src);
    const img = new Image();
    if (typeof src === 'string') img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('timeout')), 15000);
    img.onload = () => {
      clearTimeout(timer);
      if (objUrl) URL.revokeObjectURL(objUrl);
      try {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no_canvas')); return; }
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch { reject(new Error('blocked')); }
    };
    img.onerror = () => { clearTimeout(timer); if (objUrl) URL.revokeObjectURL(objUrl); reject(new Error('load_failed')); };
    img.src = typeof src === 'string' ? src : objUrl;
  });
}
