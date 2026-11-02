// ย่อรูปที่ผู้ใช้เลือกให้เป็นสี่เหลี่ยมจัตุรัสเล็ก ๆ (ครอปกลางภาพ) แล้วคืนเป็น JPEG data URL
// ขนาดเล็ก (~3–6 KB) เพื่อไม่ให้ข้อมูลก๊วนบวม
export function resizeToAvatar(file: File, size = 128, quality = 0.78): Promise<string> {
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
