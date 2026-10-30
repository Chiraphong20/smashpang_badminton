import React, { useEffect, useState } from 'react';
import { AuthShell, authField, authPrimary, authGhost } from './AuthShell';
import { fetchConfig, setUserToken, userApi } from '../lib/api';

const ERRORS: Record<string, string> = {
  invalid_email: 'ต้องเป็นอีเมล Gmail (xxx@gmail.com)',
  invalid_username: 'Username ใช้ได้เฉพาะ a-z, 0-9 และ . _ - ยาว 3–20 ตัว',
  username_taken: 'Username นี้ถูกใช้แล้ว ลองชื่ออื่น',
  weak_password: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',
  email_taken: 'Gmail นี้สมัครไว้แล้ว ลองเข้าสู่ระบบ',
  wrong_credentials: 'Username/Gmail หรือรหัสผ่านไม่ถูกต้อง',
  not_verified: 'บัญชียังไม่ได้ยืนยัน Gmail',
  suspended: 'บัญชีนี้ถูกระงับ ติดต่อแอดมิน',
  too_many_attempts: 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่',
  network: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้',
};
const err = (code?: string) => ERRORS[code || ''] || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';

const GMAIL_RE = /^[a-z0-9._%+-]+@gmail\.com$/i;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,20}$/;

type Flow = 'login' | 'register';

interface Props {
  notice?: string;
  onBack: () => void;
  onDone: () => void;
}

const field = authField;
const primary = authPrimary;
const ghost = authGhost;

export function AuthPage({ notice, onBack, onDone }: Props) {
  const [flow, setFlow] = useState<Flow>('login');
  const [step, setStep] = useState(1);

  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [devLink, setDevLink] = useState<string | undefined>();
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => { fetchConfig().then(c => setEmailEnabled(c.emailEnabled)); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const switchFlow = (f: Flow) => { setFlow(f); setStep(1); setError(''); setPassword(''); setConfirm(''); };

  // ขั้นตอนยืนยันอีเมล = step 4 ของสมัคร (ใช้ step 3 ของ login กรณีบัญชียังไม่ยืนยัน)
  const VERIFY_STEP = flow === 'register' ? 4 : 3;
  const verifyEmail = flow === 'register' ? email : identifier;

  const pwScore = (() => {
    let n = 0;
    if (password.length >= 8) n++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) n++;
    if (/\d/.test(password)) n++;
    if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) n++;
    return n;
  })();
  const pwLabel = ['อ่อนมาก', 'อ่อน', 'พอใช้', 'ดี', 'แข็งแรง'][pwScore];
  const pwColor = ['bg-gray-200', 'bg-red-400', 'bg-amber-400', 'bg-lime-500', 'bg-emerald-500'][pwScore];

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (flow === 'register') {
      if (step === 1) {
        if (!GMAIL_RE.test(email.trim())) return setError(ERRORS.invalid_email);
        setEmail(email.trim().toLowerCase()); setStep(2);
      } else if (step === 2) {
        if (!USERNAME_RE.test(username.trim())) return setError(ERRORS.invalid_username);
        setUsername(username.trim()); setStep(3);
      } else if (step === 3) {
        if (password.length < 8) return setError(ERRORS.weak_password);
        if (password !== confirm) return setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
        submitRegister();
      }
    } else {
      if (step === 1) {
        if (!identifier.trim()) return;
        setIdentifier(identifier.trim()); setStep(2);
      } else if (step === 2) {
        submitLogin();
      }
    }
  };

  const submitRegister = async () => {
    setBusy(true);
    const r = await userApi<{ devLink?: string; error?: string }>('/auth/register', 'POST', { email, username, password });
    setBusy(false);
    if (r.ok) { setDevLink(r.data.devLink); setCooldown(60); setStep(4); return; }
    setError(err(r.data.error));
    if (r.data.error === 'email_taken' || r.data.error === 'invalid_email') setStep(1);
    else if (r.data.error === 'username_taken' || r.data.error === 'invalid_username') setStep(2);
  };

  const submitLogin = async () => {
    setBusy(true);
    const r = await userApi<{ token: string; error?: string }>('/auth/login', 'POST', { identifier, password });
    setBusy(false);
    if (r.ok) { setUserToken(r.data.token); onDone(); return; }
    if (r.data.error === 'not_verified') { setError(''); setStep(VERIFY_STEP); return; }
    setError(err(r.data.error));
  };

  const resend = async () => {
    // login ด้วย username ส่งซ้ำไม่ได้ (ต้องใช้ Gmail) — ให้กรอก Gmail ก่อน
    const target = verifyEmail.includes('@') ? verifyEmail : '';
    if (!target) { setError('กรอก Gmail ของคุณเพื่อส่งลิงก์ใหม่'); return; }
    const r = await userApi<{ devLink?: string }>('/auth/resend', 'POST', { email: target });
    if (r.ok) { setDevLink(r.data.devLink); setCooldown(60); setError(''); }
  };

  const regSteps = ['Gmail', 'Username', 'รหัสผ่าน', 'ยืนยัน'];
  const isVerify = step === VERIFY_STEP;

  return (
    <AuthShell
      topLeft={<button onClick={onBack} className="text-sm font-bold text-gray-500 hover:text-gray-900">← เข้าก๊วน</button>}
      topRight={<>
        {flow === 'login' ? 'ยังไม่มีบัญชี?' : 'มีบัญชีแล้ว?'}{' '}
        <button onClick={() => switchFlow(flow === 'login' ? 'register' : 'login')} className="font-black text-primary hover:underline">
          {flow === 'login' ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
        </button>
      </>}
    >
              {notice && <p className="px-4 py-3 bg-amber-50 text-amber-700 rounded-xl text-sm font-bold">{notice}</p>}

              {/* Stepper */}
              {flow === 'register' && (
                <ol className="flex items-center">
                  {regSteps.map((label, i) => {
                    const n = i + 1;
                    const done = step > n;
                    const cur = step === n;
                    return (
                      <React.Fragment key={label}>
                        <li className="flex flex-col items-center gap-1.5">
                          <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black transition-all ${done ? 'bg-primary text-white' : cur ? 'bg-primary/10 text-primary ring-2 ring-primary' : 'bg-gray-100 text-gray-400'}`}>
                            {done ? '✓' : n}
                          </span>
                          <span className={`text-[11px] font-bold ${cur ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
                        </li>
                        {n < regSteps.length && <div className={`flex-1 h-0.5 mb-5 mx-2 ${done ? 'bg-primary' : 'bg-gray-200'}`} />}
                      </React.Fragment>
                    );
                  })}
                </ol>
              )}

              {isVerify ? (
                <div className="space-y-6 text-center">
                  <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-4xl">📧</div>
                  <div className="space-y-2">
                    <h2 className="font-headline font-black text-3xl text-gray-900">ตรวจสอบ Gmail ของคุณ</h2>
                    <p className="text-gray-500">เราส่งลิงก์ยืนยันไปที่ {verifyEmail.includes('@') ? <b className="text-gray-900">{verifyEmail}</b> : 'Gmail ของคุณ'}<br />กดลิงก์ในอีเมลภายใน 24 ชั่วโมงเพื่อเปิดใช้งานบัญชี</p>
                  </div>
                  {devLink && (
                    <a href={devLink} className="block px-4 py-3 bg-amber-50 text-amber-700 rounded-xl text-sm font-bold">
                      🧪 โหมดทดสอบ (ยังไม่ได้ตั้งค่า SMTP) — กดที่นี่เพื่อยืนยันเลย
                    </a>
                  )}
                  {error && <p className="text-sm font-bold text-red-500">{error}</p>}
                  {!verifyEmail.includes('@') && (
                    <input className={field} type="email" placeholder="Gmail ของคุณ" value={identifier} onChange={e => setIdentifier(e.target.value)} />
                  )}
                  <div className="space-y-3">
                    <a href="https://mail.google.com" target="_blank" rel="noreferrer" className={`${primary} block`}>เปิด Gmail</a>
                    <button onClick={resend} disabled={cooldown > 0} className={`${ghost} w-full disabled:opacity-50`}>
                      {cooldown > 0 ? `ส่งลิงก์ใหม่ได้ใน ${cooldown} วินาที` : 'ส่งลิงก์ยืนยันอีกครั้ง'}
                    </button>
                    <button onClick={() => switchFlow('login')} className="text-sm font-bold text-gray-500 hover:text-gray-900">ยืนยันแล้ว? เข้าสู่ระบบ</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={next} className="space-y-6">
                  <div className="space-y-2">
                    <h2 className="font-headline font-black text-3xl text-gray-900">
                      {flow === 'login'
                        ? (step === 1 ? 'ยินดีต้อนรับกลับ' : 'ใส่รหัสผ่าน')
                        : ['', 'สมัครสมาชิก', 'ตั้ง Username', 'ตั้งรหัสผ่าน'][step]}
                    </h2>
                    <p className="text-gray-500 text-sm">
                      {flow === 'login'
                        ? (step === 1 ? 'เข้าสู่ระบบเพื่อสร้างและจัดการก๊วนของคุณ' : 'กรอกรหัสผ่านเพื่อเข้าสู่ระบบ')
                        : ['', 'เริ่มจากกรอก Gmail ของคุณ (ใช้ยืนยันตัวตน)', 'ชื่อนี้ใช้เข้าสู่ระบบ — a-z, 0-9 และ . _ - ยาว 3–20 ตัว', 'ตั้งรหัสผ่านอย่างน้อย 8 ตัวอักษร'][step]}
                    </p>
                  </div>

                  {/* ── Login ── */}
                  {flow === 'login' && step === 1 && (
                    <input autoFocus className={field} placeholder="Username หรือ Gmail" value={identifier} onChange={e => setIdentifier(e.target.value)} autoCapitalize="none" autoCorrect="off" />
                  )}
                  {flow === 'login' && step === 2 && (
                    <>
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl text-sm">
                        <span className="font-bold text-gray-800 truncate">{identifier}</span>
                        <button type="button" onClick={() => { setStep(1); setError(''); }} className="text-primary font-black text-xs shrink-0 ml-3">เปลี่ยน</button>
                      </div>
                      <PasswordInput autoFocus value={password} onChange={setPassword} show={showPw} setShow={setShowPw} placeholder="รหัสผ่าน" />
                    </>
                  )}

                  {/* ── Register ── */}
                  {flow === 'register' && step === 1 && (
                    <input autoFocus className={field} type="email" placeholder="yourname@gmail.com" value={email} onChange={e => setEmail(e.target.value)} autoCapitalize="none" autoCorrect="off" />
                  )}
                  {flow === 'register' && step === 2 && (
                    <input autoFocus className={field} placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" maxLength={20} />
                  )}
                  {flow === 'register' && step === 3 && (
                    <div className="space-y-4">
                      <PasswordInput autoFocus value={password} onChange={setPassword} show={showPw} setShow={setShowPw} placeholder="รหัสผ่าน" />
                      {password && (
                        <div className="space-y-1">
                          <div className="flex gap-1.5">{[1, 2, 3, 4].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full ${pwScore >= i ? pwColor : 'bg-gray-200'}`} />)}</div>
                          <p className="text-xs font-bold text-gray-400">ความปลอดภัย: {pwLabel}</p>
                        </div>
                      )}
                      <PasswordInput value={confirm} onChange={setConfirm} show={showPw} setShow={setShowPw} placeholder="ยืนยันรหัสผ่านอีกครั้ง" />
                    </div>
                  )}

                  {error && <p className="text-sm font-bold text-red-500">{error}</p>}

                  <div className="flex gap-3">
                    {step > 1 && (
                      <button type="button" className={ghost} onClick={() => { setStep(step - 1); setError(''); }}>ย้อนกลับ</button>
                    )}
                    <button disabled={busy} className={primary}>
                      {busy ? 'กำลังดำเนินการ...'
                        : flow === 'login' ? (step === 1 ? 'ถัดไป' : 'เข้าสู่ระบบ')
                        : step === 3 ? 'สมัครสมาชิก' : 'ถัดไป'}
                    </button>
                  </div>

                  {flow === 'register' && !emailEnabled && step === 3 && (
                    <p className="text-xs text-amber-600 text-center">เซิร์ฟเวอร์ยังไม่ได้ตั้งค่าอีเมล (SMTP) — จะแสดงลิงก์ยืนยันให้กดในหน้าถัดไปแทน</p>
                  )}
                </form>
              )}
    </AuthShell>
  );
}

function PasswordInput({ value, onChange, show, setShow, placeholder, autoFocus }: {
  value: string; onChange: (v: string) => void; show: boolean; setShow: (b: boolean) => void; placeholder: string; autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <input autoFocus={autoFocus} className={`${field} pr-20`} type={show ? 'text' : 'password'} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400 hover:text-gray-700">
        {show ? 'ซ่อน' : 'แสดง'}
      </button>
    </div>
  );
}
