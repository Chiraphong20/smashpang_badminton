import React, { useState } from 'react';
import { AuthShell, authField, authPrimary } from './AuthShell';
import { setUserToken, userApi } from '../lib/api';

const ERRORS: Record<string, string> = {
  invalid_email: 'อีเมลไม่ถูกต้อง (เช่น name@example.com)',
  invalid_username: 'Username ใช้ได้เฉพาะ a-z, 0-9 และ . _ - ยาว 3–20 ตัว',
  username_taken: 'Username นี้ถูกใช้แล้ว ลองชื่ออื่น',
  weak_password: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
  email_taken: 'อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบ',
  wrong_credentials: 'Username/อีเมล หรือรหัสผ่านไม่ถูกต้อง',
  suspended: 'บัญชีนี้ถูกระงับ ติดต่อแอดมิน',
  too_many_attempts: 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่',
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

  const switchFlow = (f: Flow) => { setFlow(f); setError(''); setPassword(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (flow === 'register') {
      if (!EMAIL_RE.test(email.trim())) return setError(ERRORS.invalid_email);
      if (!USERNAME_RE.test(username.trim())) return setError(ERRORS.invalid_username);
      if (password.length < 6) return setError(ERRORS.weak_password);
      setBusy(true);
      const r = await userApi<{ token: string; error?: string }>('/auth/register', 'POST', { email: email.trim(), username: username.trim(), password });
      setBusy(false);
      if (r.ok) { setUserToken(r.data.token); onDone(); return; }
      setError(err(r.data.error));
    } else {
      if (!identifier.trim() || !password) return;
      setBusy(true);
      const r = await userApi<{ token: string; error?: string }>('/auth/login', 'POST', { identifier: identifier.trim(), password });
      setBusy(false);
      if (r.ok) { setUserToken(r.data.token); onDone(); return; }
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

      <form onSubmit={submit} className="space-y-6">
        <div className="space-y-2">
          <h2 className="font-headline font-black text-3xl text-gray-900">{flow === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</h2>
          <p className="text-gray-500 text-sm">
            {flow === 'login'
              ? 'ใช้ Username หรืออีเมล พร้อมรหัสผ่าน เพื่อสร้างและจัดการก๊วนของคุณ'
              : 'กรอก 3 ช่อง ใช้งานได้ทันที ไม่ต้องยืนยันอีเมล'}
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
