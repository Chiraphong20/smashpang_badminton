import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Delete } from 'lucide-react';
import { cn } from '../lib/utils';
import { login, formatSlot, ListingSlot } from '../lib/api';
import { AuthShell, Stepper } from './AuthShell';

interface Props {
  gid: string;
  groupName: string;
  schedule?: ListingSlot[];
  pinLength: number;
  onLogin: () => void;
}

export function LoginScreen({ gid, groupName, schedule = [], pinLength, onLogin }: Props) {
  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const press = (digit: string) => {
    if (busy || input.length >= pinLength) return;
    const next = input + digit;
    setInput(next);
    if (next.length === pinLength) {
      setBusy(true);
      login(gid, next).then(result => {
        if (result === 'ok') {
          setSuccess(true);
          setTimeout(onLogin, 600);
          return;
        }
        setMessage(result === 'locked' ? 'ลองผิดหลายครั้งเกินไป รอสักครู่' : result === 'error' ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' : 'PIN ไม่ถูกต้อง');
        setShake(true);
        setTimeout(() => { setInput(''); setShake(false); setMessage(''); setBusy(false); }, 900);
      });
    }
  };

  const del = () => setInput(p => p.slice(0, -1));

  // พิมพ์ PIN จากคีย์บอร์ดได้ (Desktop)
  const pressRef = useRef(press);
  const delRef = useRef(del);
  pressRef.current = press;
  delRef.current = del;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) pressRef.current(e.key);
      else if (e.key === 'Backspace') delRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.4, ease: 'easeInOut' }}
      className="fixed inset-0 z-[500] select-none"
    >
      <AuthShell
        topLeft={<a href={window.location.pathname} className="text-sm font-bold text-gray-500 hover:text-gray-900">← เปลี่ยนก๊วน</a>}
        topRight={<span className="font-semibold text-gray-400">รหัสก๊วน: {gid}</span>}
      >
        <Stepper steps={['รหัสก๊วน', 'ยืนยัน PIN']} current={2} />
        <div className="space-y-2">
          <h2 className="font-headline font-black text-3xl text-gray-900 break-words">{groupName}</h2>
          {schedule.length > 0 && <p className="text-sm font-bold text-gray-500">{schedule.map(formatSlot).join(' · ')}</p>}
          <p className={cn('text-sm', success ? 'text-emerald-600 font-bold' : shake ? 'text-red-500 font-bold' : 'text-gray-500')}>
            {success ? '✓ เข้าสู่ระบบสำเร็จ' : shake ? message : 'ใส่ PIN เพื่อเข้าก๊วน'}
          </p>
        </div>

        <motion.div
          animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-center gap-4 py-2"
        >
          {Array.from({ length: pinLength }).map((_, i) => (
            <motion.div
              key={i}
              animate={{ scale: i === input.length - 1 ? [1, 1.3, 1] : 1 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'w-4 h-4 rounded-full border-2 transition-all duration-150',
                success ? 'bg-emerald-500 border-emerald-500'
                  : shake ? 'bg-red-500 border-red-500'
                  : i < input.length ? 'bg-primary border-primary'
                  : 'bg-transparent border-gray-300'
              )}
            />
          ))}
        </motion.div>

        <div className="grid grid-cols-3 gap-3 w-full">
          {keys.map((k, i) => {
            if (k === '') return <div key={i} />;
            const isDel = k === '⌫';
            return (
              <motion.button
                key={i}
                whileTap={{ scale: 0.92 }}
                onClick={() => isDel ? del() : press(k)}
                className={cn(
                  'h-16 rounded-xl font-black text-2xl flex items-center justify-center transition-colors border-2',
                  isDel
                    ? 'border-transparent text-gray-400 hover:bg-gray-50'
                    : 'border-gray-200 text-gray-900 bg-white hover:border-primary/50 hover:bg-primary/5 active:bg-primary/10'
                )}
              >
                {isDel ? <Delete size={22} /> : k}
              </motion.button>
            );
          })}
        </div>
      </AuthShell>
    </motion.div>
  );
}
