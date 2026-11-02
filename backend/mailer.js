// ส่งอีเมลผ่าน Resend (https://resend.com) ด้วย fetch ตรง ๆ — ไม่ต้องติดตั้งไลบรารีเพิ่ม
// ตั้ง RESEND_API_KEY และ RESEND_FROM_EMAIL (ต้องเป็นโดเมนที่ยืนยันกับ Resend แล้ว เช่น "SmashPang <no-reply@yourdomain.com>")
// ไม่ได้ตั้ง RESEND_API_KEY = ปิดการยืนยันอีเมล (สมัครแล้วใช้ได้เลย)
export const emailEnabled = () => !!process.env.RESEND_API_KEY;

export async function sendMail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev', to: [to], subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
  }
}
