import React, { useEffect, useState } from 'react';
import { AuthShell, authField, authPrimary } from './AuthShell';
import { fetchConfig, setUserToken, userApi } from '../lib/api';

const ERRORS: Record<string, string> = {
  invalid_email: 'อีเมลไม่ถูกต้อง (เช่น name@example.com)',
  invalid_username: 'Username ใช้ได้เฉพาะ a-z, 0-9 และ . _ - ยาว 3–20 ตัว',
  username_taken: 'Username นี้ถูกใช้แล้ว ลองชื่ออื่น',
  weak_password: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
  email_taken: 'อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบ',
  wrong_credentials: 'Username/อีเมล หรือรหัสผ่านไม่ถูกต้อง',
  suspended: 'บัญชีนี้ถูกระงับ ติดต่อแอดมิน',
  too_many_attempts: 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่',
  invalid_code: 'รหัสไม่ถูกต้อง ลองอีกครั้ง',
  code_expired: 'รหัสหมดอายุหรือยังไม่ได้ขอรหัส — กด "ส่งรหัสใหม่"',
  too_many_codes: 'กรอกผิดหลายครั้งเกินไป — กด "ส่งรหัสใหม่" เพื่อรับรหัสใหม่',
  email_failed: 'ส่งอีเมลไม่สำเร็จ ลองกด "ส่งรหัสใหม่" อีกครั้ง',
  cooldown: 'เพิ่งส่งรหัสไป รอสักครู่แล้วกดใหม่',
  network: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้',
};
const err = (code?: string) => ERRORS[code || ''] || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,20}$/;

type Flow = 'login' | 'register';

interface Props {
  notice?: string;
  onBack: () => void;
  onDone: () => void;
}

const field = authField;
const primary = authPrimary;

export function AuthPage({ notice, onBack, onDone }: Props) {
  const [flow, setFlow] = useState<Flow>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [emailOn, setEmailOn] = useState(false);
  // ขั้นกรอก OTP (ขึ้นหลังสมัคร หรือเมื่อล็อกอินบัญชีที่ยังไม่ยืนยัน)
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [info, setInfo] = useState('');

  useEffect(() => { fetchConfig().then(c => setEmailOn(c.emailEnabled)); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const startOtp = (mail: string, alreadySent: boolean) => {
    setOtpEmail(mail); setCode(''); setError(''); setPassword('');
    setInfo(alreadySent ? '' : 'ยังไม่ได้ยืนยันอีเมล — กด "ส่งรหัสใหม่" เพื่อรับรหัส');
    if (alreadySent) setCooldown(60);
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpEmail || !/^\d{6}$/.test(code)) return;
    setBusy(true); setError('');
    const r = await userApi<{ token: string; error?: string; left?: number }>('/auth/verify-otp', 'POST', { email: otpEmail, code });
    setBusy(false);
    if (r.ok) { setUserToken(r.data.token); onDone(); return; }
    setError(r.data.error === 'invalid_code' && typeof r.data.left === 'number' ? `รหัสไม่ถูกต้อง (เหลืออีก ${r.data.left} ครั้ง)` : err(r.data.error));
    setCode('');
  };

  const resendOtp = async () => {
    if (!otpEmail || cooldown > 0) return;
    setError(''); setInfo('');
    const r = await userApi<{ error?: string }>('/auth/resend', 'POST', { email: otpEmail });
    if (r.ok) { setCooldown(60); setInfo('ส่งรหัสใหม่แล้ว เช็กอีเมลของคุณ (รวมถึงกล่องสแปม)'); }
    else { setError(err(r.data.error)); if (r.data.error === 'cooldown') setCooldown(30); }
  };

  const switchFlow = (f: Flow) => { setFlow(f); setError(''); setPassword(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (flow === 'register') {
      if (!EMAIL_RE.test(email.trim())) return setError(ERRORS.invalid_email);
      if (!USERNAME_RE.test(username.trim())) return setError(ERRORS.invalid_username);
      if (password.length < 6) return setError(ERRORS.weak_password);
      setBusy(true);
      const r = await userApi<{ token?: string; error?: string; needsOtp?: boolean; email?: string }>('/auth/register', 'POST', { email: email.trim(), username: username.trim(), password });
      setBusy(false);
      if (r.ok && r.data.needsOtp) { startOtp(r.data.email || email.trim().toLowerCase(), true); return; }
      if (r.ok && r.data.token) { setUserToken(r.data.token); onDone(); return; }
      if (r.data.needsOtp) { startOtp(r.data.email || email.trim().toLowerCase(), false); setError(err(r.data.error)); return; }
      setError(err(r.data.error));
    } else {
      if (!identifier.trim() || !password) return;
      setBusy(true);
      const r = await userApi<{ token: string; error?: string; email?: string }>('/auth/login', 'POST', { identifier: identifier.trim(), password });
      setBusy(false);
      if (r.ok) { setUserToken(r.data.token); onDone(); return; }
      if (r.data.error === 'not_verified' && r.data.email) { startOtp(r.data.email, false); return; }
      setError(err(r.data.error));
    }
  };

  return (
    <AuthShell
      topLeft={<button onClick={onBack} className="text-sm font-bold text-gray-500 hover:text-gray-900">← หน้าแรก</button>}
      topRight={<>
        {flow === 'login' ? 'ยังไม่มีบัญชี?' : 'มีบัญชีแล้ว?'}{' '}
        <button onClick={() => switchFlow(flow === 'login' ? 'register' : 'login')} className="font-black text-primary hover:underline">
          {flow === 'login' ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
        </button>
      </>}
    >
      {notice && <p className="px-4 py-3 bg-amber-50 text-amber-700 rounded-xl text-sm font-bold">{notice}</p>}

      {otpEmail ? (
        <form onSubmit={verifyOtp} className="space-y-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-3xl">✉️</div>
          <div className="space-y-2">
            <h2 className="font-headline font-black text-3xl text-gray-900">ยืนยันอีเมลของคุณ</h2>
            <p className="text-gray-500 text-sm">กรอกรหัส 6 หลักที่ส่งไปที่<br /><b className="text-gray-900">{otpEmail}</b><br />รหัสหมดอายุใน 10 นาที</p>
          </div>
          <input autoFocus className={`${field} text-center text-3xl font-black tracking-[0.5em] pl-[0.5em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••"
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          {info && <p className="text-sm font-bold text-emerald-600">{info}</p>}
          {error && <p className="text-sm font-bold text-red-500">{error}</p>}
          <button disabled={busy || code.length !== 6} className={`${primary} w-full`}>{busy ? 'กำลังตรวจสอบ...' : 'ยืนยัน'}</button>
          <div className="flex items-center justify-between text-sm font-bold">
            <button type="button" onClick={() => { setOtpEmail(null); setError(''); setInfo(''); }} className="text-gray-400 hover:text-gray-700">← แก้ไขอีเมล</button>
            <button type="button" onClick={resendOtp} disabled={cooldown > 0} className="text-primary disabled:text-gray-400">{cooldown > 0 ? `ส่งรหัสใหม่ได้ใน ${cooldown} วินาที` : 'ส่งรหัสใหม่'}</button>
          </div>
        </form>
      ) : (
      <form onSubmit={submit} className="space-y-6">
        <div className="space-y-2">
          <h2 className="font-headline font-black text-3xl text-gray-900">{flow === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</h2>
          <p className="text-gray-500 text-sm">
            {flow === 'login'
              ? 'ใช้ Username หรืออีเมล พร้อมรหัสผ่าน เพื่อสร้างและจัดการก๊วนของคุณ'
              : emailOn ? 'กรอก 3 ช่อง แล้วยืนยันอีเมลด้วยรหัส 6 หลัก' : 'กรอก 3 ช่อง ใช้งานได้ทันที'}
          </p>
        </div>

        {flow === 'login' ? (
          <div className="space-y-4">
            <input autoFocus className={field} placeholder="Username หรืออีเมล" value={identifier} onChange={e => setIdentifier(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" />
            <PasswordInput value={password} onChange={setPassword} show={showPw} setShow={setShowPw} placeholder="รหัสผ่าน" autoComplete="current-password" />
          </div>
        ) : (
          <div className="space-y-4">
            <input autoFocus className={field} type="email" placeholder="อีเมล" value={email} onChange={e => setEmail(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="email" />
            <input className={field} placeholder="Username (a-z, 0-9 ยาว 3–20 ตัว)" value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" maxLength={20} autoComplete="username" />
            <PasswordInput value={password} onChange={setPassword} show={showPw} setShow={setShowPw} placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)" autoComplete="new-password" />
          </div>
        )}

        {error && <p className="text-sm font-bold text-red-500">{error}</p>}

        <button disabled={busy} className={`${primary} w-full`}>
          {busy ? 'กำลังดำเนินการ...' : flow === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
        </button>
      </form>
      )}
    </AuthShell>
  );
}

function PasswordInput({ value, onChange, show, setShow, placeholder, autoComplete }: {
  value: string; onChange: (v: string) => void; show: boolean; setShow: (b: boolean) => void; placeholder: string; autoComplete?: string;
}) {
  return (
    <div className="relative">
      <input className={`${field} pr-20`} type={show ? 'text' : 'password'} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400 hover:text-gray-700">
        {show ? 'ซ่อน' : 'แสดง'}
      </button>
    </div>
  );
}
