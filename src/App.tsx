import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Users, LayoutDashboard, Trophy, Banknote, UserPlus, Search, ShoppingCart, History, FileText, ChevronLeft, ChevronRight, Menu, Settings, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Member, Court, Rank, RANKS, RANK_COLORS, Snack, PaymentRecord, GameRecord, SessionRecord, CourtQueueSlot, QueuePlayer, SessionMode, ModeConfig, DEFAULT_MODE_CONFIG } from './types';
import { format } from 'date-fns';
import confetti from 'canvas-confetti';

import { LoginScreen } from './components/LoginScreen';
import { GroupGate } from './components/GroupGate';
import { FindGroups } from './components/FindGroups';
import { Landing } from './components/Landing';
import { apiFetch, apiJson, getGroupId, getToken, clearToken, isQueueMode, fetchGroupInfo, rememberGroup, groupUrl, formatSlot, ListingSlot } from './lib/api';
import { DashboardTab } from './components/DashboardTab';
import { CourtsTab } from './components/CourtsTab';
import { MembersTab } from './components/MembersTab';
import { SettingsTab } from './components/SettingsTab';
import { StatsTab } from './components/StatsTab';
import { AdminPanel } from './components/AdminPanel';
import { GroupNameSetup, ModePicker } from './components/SetupOverlay';
import { AddMemberModal } from './components/AddMemberModal';
import { AddCourtModal } from './components/AddCourtModal';
import { ManageProductsModal } from './components/ManageProductsModal';
import { ImportMembersModal } from './components/ImportMembersModal';
import { LogsTab } from './components/LogsTab';
import { QueueView } from './components/QueueView';
import { RANK_WEIGHTS } from './types';
import { useModalHotkeys } from './hooks/useModalHotkeys';

type Tab = 'dashboard' | 'members' | 'courts' | 'settings' | 'logs' | 'stats';

const TAB_SHORTCUTS: Partial<Record<Tab, string>> = { dashboard: 'F1', courts: 'F2', logs: 'F3', members: 'F4' };
const SHORTCUT_TABS: Record<string, Tab> = { F1: 'dashboard', F2: 'courts', F3: 'logs', F4: 'members' };

const mkMember = (id: string, name: string, rank: Rank, gamesPlayed: number, offset: number): Member => ({
  id, name, rank, gamesPlayed,
  checkInTime: Date.now() - offset,
  status: 'waiting',
  balance: 0, courtBalance: 0, shuttleBalance: 0, shuttleCount: 0, snackBalance: 0,
  snackHistory: [],
  paidCourtFee: false,
  totalCourt: 0, totalShuttle: 0, totalSnack: 0,
});

const INITIAL_MEMBERS: Member[] = [];

const INITIAL_COURTS: Court[] = [
  { id: 'c1', name: 'คอร์ด 1', players: [null, null, null, null], status: 'empty', shuttlecocks: 1 },
  { id: 'c2', name: 'คอร์ด 2', players: [null, null, null, null], status: 'empty', shuttlecocks: 1 },
  { id: 'c3', name: 'คอร์ด 3', players: [null, null, null, null], status: 'empty', shuttlecocks: 1 },
  { id: 'c4', name: 'คอร์ด 4', players: [null, null, null, null], status: 'empty', shuttlecocks: 1 },
  { id: 'c5', name: 'คอร์ด 5', players: [null, null, null, null], status: 'empty', shuttlecocks: 1 },
];

// ตัวเลือกหน้า: ยังไม่เลือกก๊วน → หน้าเลือก/สร้างก๊วน · ?queue → จอคิว · ยังไม่ login → PIN · อื่นๆ → แอปของก๊วน
export default function App() {
  const gid = getGroupId();
  const [groupName, setGroupName] = useState<string | null>(null);
  const [pinLength, setPinLength] = useState(4);
  const [schedule, setSchedule] = useState<ListingSlot[]>([]);
  const [groupMissing, setGroupMissing] = useState(false);
  const [authed, setAuthed] = useState(() => !!getToken(gid));

  useEffect(() => {
    if (!gid || isQueueMode()) return;
    fetchGroupInfo(gid).then(info => {
      if (!info) { setGroupMissing(true); return; }
      if (info.suspended) { setGroupMissing(true); return; }
      setGroupName(info.name);
      setPinLength(info.pinLength);
      setSchedule(info.schedule ?? []);
      rememberGroup({ id: info.id, name: info.name });
    });
  }, [gid]);

  if (new URLSearchParams(window.location.search).has('admin')) return <AdminPanel />;
  if (new URLSearchParams(window.location.search).has('find')) return <FindGroups />;
  if (!gid && !groupMissing && !['join', 'account', 'verify'].some(k => new URLSearchParams(window.location.search).has(k))) return <Landing />;
  if (!gid || groupMissing) return <GroupGate notFoundId={groupMissing ? gid : undefined} />;
  if (isQueueMode()) return <QueueView />;
  if (!groupName) return <div className="min-h-screen bg-on-surface" />;
  if (!authed) return (
    <AnimatePresence>
      <LoginScreen gid={gid} groupName={groupName} schedule={schedule} pinLength={pinLength} onLogin={() => setAuthed(true)} />
    </AnimatePresence>
  );
  const renameGroup = async (name: string, slot: ListingSlot | null) => {
    const res = await apiJson('/name', { name }, 'PUT');
    if (!res.ok) return false;
    setGroupName(name);
    rememberGroup({ id: gid, name });
    if (slot) {
      // เก็บเวลาจัดก๊วนในข้อมูลประกาศ (ไม่เปิดประกาศสาธารณะ) — ถ้าบันทึกไม่ได้ ชื่อก็ตั้งสำเร็จแล้ว ตั้งเวลาทีหลังได้
      try {
        const cur = await (await apiFetch('/listing')).json();
        const { name: _n, updatedAt: _u, ...rest } = cur;
        const put = await apiJson('/listing', { ...rest, schedule: [slot] }, 'PUT');
        if (put.ok) setSchedule([slot]);
      } catch { /* ignore */ }
    }
    return true;
  };
  return <GroupApp groupName={groupName} schedule={schedule} needsName={groupName === gid} onRename={renameGroup} />;
}

function GroupApp({ groupName, schedule, needsName, onRename }: { groupName: string; schedule: ListingSlot[]; needsName: boolean; onRename: (name: string, slot: ListingSlot | null) => Promise<boolean> }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [gameHistory, setGameHistory] = useState<GameRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('courts');
  const [courtFeePerPerson, setCourtFeePerPerson] = useState(40);
  const [shuttlePrice, setShuttlePrice] = useState(25);
  // null = วันนี้ยังไม่ได้เลือกรูปแบบก๊วน (จะขึ้นหน้าเลือกโหมด) · เริ่มวันใหม่แล้วกลับเป็น null
  const [sessionMode, setSessionMode] = useState<SessionMode | null>(null);
  const activeMode: SessionMode = sessionMode ?? 'perGame';
  const [modeConfig, setModeConfig] = useState<ModeConfig>(DEFAULT_MODE_CONFIG);
  // ค่าลูกต่อลูก/คน ที่ใช้คิดเงินจริง — เฉพาะโหมดคิดตามเกมเท่านั้นที่คิดรายเกม
  const effShuttlePrice = activeMode === 'perGame' ? shuttlePrice : 0;
  // ค่าสนามที่เรียกเก็บตอนลงเล่นเกมแรกของแต่ละคน
  const entryFee = activeMode === 'perGame' ? courtFeePerPerson : activeMode === 'buffet' ? modeConfig.buffetPrice : 0;
  const [minRankFilter, setMinRankFilter] = useState<Rank>('P+');
  const [maxRankFilter, setMaxRankFilter] = useState<Rank>('VIP1');
  const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>([]);
  const [viewingSession, setViewingSession] = useState<SessionRecord | null>(null);
  const [rankMemory, setRankMemory] = useState<Record<string, Rank>>({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sp_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const toggleSidebar = () => setIsSidebarCollapsed(v => {
    try { localStorage.setItem('sp_sidebar_collapsed', v ? '0' : '1'); } catch { /* storage blocked */ }
    return !v;
  });
  // เก็บวันที่เริ่มต้นก๊วน (fix ปัญหาเลยเที่ยงคืน)
  const [sessionStartDate, setSessionStartDate] = useState<number | null>(null);

  // Modal states
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddCourt, setShowAddCourt] = useState(false);
  const [showManageProducts, setShowManageProducts] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importIsSession, setImportIsSession] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [courtQueues, setCourtQueues] = useState<Record<string, CourtQueueSlot[]>>({});
  const [nextQueuePrompt, setNextQueuePrompt] = useState<{
    courtId: string; courtName: string; slot: CourtQueueSlot; emptyCourts: Court[];
  } | null>(null);

  // เปลี่ยนสีหลักของทั้งแอปตามโหมด (ดู :root[data-mode] ใน index.css)
  useEffect(() => {
    document.documentElement.dataset.mode = activeMode;
    return () => { delete document.documentElement.dataset.mode; };
  }, [activeMode]);

  // Sync to API on startup
  useEffect(() => {
    (async () => {
      try {
        setIsSyncing(true);
        const [stateRes, masterRes] = await Promise.all([
          apiFetch('/state').catch(() => null),
          apiFetch('/master').catch(() => null)
        ]);

        let loadedState: any = null;
        if (stateRes && stateRes.ok) loadedState = await stateRes.json();
        if (typeof loadedState?._version === 'number') stateVersionRef.current = loadedState._version;

        let loadedMaster: any = null;
        if (masterRes && masterRes.ok) loadedMaster = await masterRes.json();

        // 1) Load basic states
        if (loadedState?.courts && loadedState.courts.length > 0) {
          setCourts(loadedState.courts);
        } else {
          setCourts(INITIAL_COURTS);
        }

        if (loadedState?.gameHistory) setGameHistory(loadedState.gameHistory);
        if (loadedState?.paymentHistory) setPaymentHistory(loadedState.paymentHistory);
        if (loadedState?.sessionHistory) setSessionHistory(loadedState.sessionHistory);
        if (loadedState?.courtFeePerPerson) setCourtFeePerPerson(loadedState.courtFeePerPerson);
        if (loadedState?.shuttlePrice) setShuttlePrice(loadedState.shuttlePrice);
        if (loadedState?.sessionMode) setSessionMode(loadedState.sessionMode);
        if (loadedState?.modeConfig) setModeConfig({ ...DEFAULT_MODE_CONFIG, ...loadedState.modeConfig });
        if (loadedState?.sessionStartDate) setSessionStartDate(loadedState.sessionStartDate);
        if (loadedState?.courtQueues) setCourtQueues(loadedState.courtQueues);
        if (loadedState?.snacks) {
          setSnacks(loadedState.snacks);
        }

        // 2) Load and Merge Master <-> State
        let activeMembers: Member[] = loadedState?.members || [...INITIAL_MEMBERS];
        let combinedRankMemory = loadedState?.rankMemory || {};

        if (loadedMaster?.rankMemory) {
          combinedRankMemory = { ...combinedRankMemory, ...loadedMaster.rankMemory };
        }

        if (loadedMaster?.members) {
          loadedMaster.members.forEach((masterMem: Member) => {
            combinedRankMemory[masterMem.name] = masterMem.rank;
            const existing = activeMembers.find(m => m.name.toLowerCase() === masterMem.name.toLowerCase());
            if (!existing) {
              activeMembers.push({ ...masterMem, status: 'resting' });
            }
          });
        }

        setMembers(activeMembers);
        setRankMemory(combinedRankMemory);

      } catch (err) {
        console.error('Failed to load initial data from DB:', err);
      } finally {
        setIsSyncing(false);
        // Add a slight artificial delay for the premium feel
        setTimeout(() => setIsInitialLoading(false), 1200);
      }
    })();
  }, []);

  // Keep a ref with latest state for the auto-save interval
  const autoSaveStateRef = useRef<object>({});
  useEffect(() => {
    autoSaveStateRef.current = {
      members, courts, gameHistory, paymentHistory, sessionHistory,
      rankMemory, courtFeePerPerson, shuttlePrice, snacks, sessionStartDate, courtQueues, sessionMode, modeConfig
    };
  }, [members, courts, gameHistory, paymentHistory, sessionHistory, rankMemory, courtFeePerPerson, shuttlePrice, snacks, sessionStartDate, courtQueues, sessionMode, modeConfig]);

  // เวอร์ชันล่าสุดของข้อมูลที่เครื่องนี้รู้จัก (จาก DB) — ใช้กันเครื่อง/แท็บเก่า
  // save ทับข้อมูลใหม่แบบเงียบๆ (root cause ของเคสข้อมูลวันที่ 15/08 หาย)
  const stateVersionRef = useRef<number>(0);

  // Save ขึ้น DB แบบรู้เวอร์ชัน: ถ้าเครื่องอื่น save ไปแล้วหลังจากที่เราโหลดข้อมูลล่าสุด
  // (เซิร์ฟเวอร์ตอบ 409) แปลว่าข้อมูลในเครื่องนี้เก่ากว่าความจริงแล้ว ห้าม save ทับ
  // ให้รีโหลดหน้าใหม่เพื่อดึงข้อมูลล่าสุดมาแทนทันที
  const postState = async (body: Record<string, unknown>) => {
    try {
      const res = await apiJson('/state', { ...body, _version: stateVersionRef.current });
      if (res.status === 409) {
        console.warn('⚠️ มีการบันทึกข้อมูลจากเครื่อง/แท็บอื่นไปแล้ว — โหลดข้อมูลล่าสุดใหม่เพื่อกันข้อมูลชนกัน');
        location.reload();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (typeof data.version === 'number') stateVersionRef.current = data.version;
        setLastAutoSave(new Date());
      }
    } catch (err) {
      console.warn('Failed to save state to DB:', err);
    }
  };

  // Auto-save every 2 minutes regardless of state changes
  useEffect(() => {
    const interval = setInterval(() => {
      postState(autoSaveStateRef.current as Record<string, unknown>);
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // เมื่อกลับมาเปิดแท็บ/โฟกัสหน้าต่างนี้อีกครั้ง (เช่น แท็บที่ค้างไว้หลายวัน)
  // เช็คก่อนว่าข้อมูลในเครื่องนี้ตามทันเซิร์ฟเวอร์หรือยัง ถ้าตามไม่ทันให้รีโหลด
  // ทันที ก่อนที่จะมีการ save ทับข้อมูลใหม่กว่าโดยไม่รู้ตัว
  useEffect(() => {
    const checkFreshness = async () => {
      try {
        const res = await apiFetch('/state');
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data._version === 'number' && data._version !== stateVersionRef.current) {
          console.warn('⚠️ ข้อมูลในเครื่องนี้เก่ากว่าเซิร์ฟเวอร์ (มีการอัปเดตจากที่อื่น) กำลังโหลดข้อมูลล่าสุด...');
          location.reload();
        }
      } catch {}
    };
    const onVisible = () => { if (document.visibilityState === 'visible') checkFreshness(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', checkFreshness);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', checkFreshness);
    };
  }, []);

  // Debounced save EVERYTHING to Database
  useEffect(() => {
    const handler = setTimeout(() => {
      // Don't save empty states over initial real DB states before API finishes pulling
      // if (members.length === 0 && isSyncing) return;

      postState({
        members,
        courts,
        gameHistory,
        paymentHistory,
        sessionHistory,
        rankMemory,
        courtFeePerPerson,
        shuttlePrice,
        snacks,
        sessionStartDate,
        courtQueues,
        sessionMode,
        modeConfig
      });
    }, 2000);
    return () => clearTimeout(handler);
  }, [members, courts, gameHistory, paymentHistory, sessionHistory, courtFeePerPerson, shuttlePrice, rankMemory, snacks, sessionStartDate, courtQueues, sessionMode, modeConfig]);

  // Debounced save MASTER DATA (Permanent members & Settings) to MySQL
  useEffect(() => {
    const handler = setTimeout(async () => {
      try {
        await apiJson('/master', {
          members: members,
          settings: { courtFeePerPerson, shuttlePrice }
        });
      } catch (err) {
        console.warn('Failed to save master data to DB:', err);
      }
    }, 5000); // Save master data less frequently
    return () => clearTimeout(handler);
  }, [members, courtFeePerPerson, shuttlePrice]);

  // Keyboard shortcuts: F1 ภาพรวม, F2 คอร์ด, F3 บันทึก, F4 สมาชิก
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tab = SHORTCUT_TABS[e.key];
      if (tab) {
        e.preventDefault();
        setActiveTab(tab);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const resetDay = async () => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการเริ่มวันใหม่? (ล้างประวัติการตีและรีเซ็ตคอร์ด)')) return;

    const archivedSession = saveSession();
    const newSessionHistory = archivedSession ? [archivedSession, ...sessionHistory] : sessionHistory;

    const resetMembers = members.map(m => ({
      ...m,
      gamesPlayed: 0,
      balance: 0,
      courtBalance: 0,
      shuttleBalance: 0,
      shuttleCount: 0,
      snackBalance: 0,
      snackHistory: [],
      paidCourtFee: false,
      status: 'resting' as const,
      checkInTime: Date.now(),
      totalCourt: 0,
      totalShuttle: 0,
      totalSnack: 0
    }));

    // Sync session to the DB (เก็บลง sessions/games/payments ให้ถาวร)
    setIsSyncing(true);
    try {
      await apiJson('/sync', {
        timestamp: Date.now(),
        members: members,
        games: gameHistory,
        payments: paymentHistory
      });
    } catch (err) {
      console.error('Failed to archive session to DB:', err);
    } finally {
      setIsSyncing(false);
    }

    setSessionStartDate(null);
    setGameHistory([]);
    setPaymentHistory([]);
    setCourts(INITIAL_COURTS);
    setMembers(resetMembers);
    setModeConfig(prev => ({ ...prev, splitApplied: undefined, splitCourtTotal: 0, splitShuttleTotal: 0 }));
    setSessionMode(null); // วันใหม่ เลือกรูปแบบก๊วนใหม่ได้

    // เซฟค่าที่รีเซ็ตแล้วขึ้น DB "ทันที" แบบ await ในนี้เลย ไม่รอ debounce 2 วิ
    // ของ effect ทั่วไป — เพราะถ้าผู้ใช้กด refresh เร็วกว่านั้น (เป็นเรื่องปกติมาก
    // หลังกดปุ่ม "จบวัน" แล้วรีเฟรชดูผลทันที) ตัว reset จะไม่ทันถูกบันทึกขึ้น DB เลย
    // ทำให้ข้อมูลเก่าค้างอยู่เหมือนไม่ได้กดจบวันไปเลย (บั๊กที่เจอจริง)
    await postState({
      members: resetMembers,
      courts: INITIAL_COURTS,
      gameHistory: [],
      paymentHistory: [],
      sessionHistory: newSessionHistory,
      rankMemory,
      courtFeePerPerson,
      shuttlePrice,
      snacks,
      sessionStartDate: null,
      courtQueues,
      sessionMode: null,
      modeConfig: { ...modeConfig, splitApplied: undefined, splitCourtTotal: 0, splitShuttleTotal: 0 }
    });
  };

  const clearBoard = () => {
    if (!confirm('ยืนยัน "ล้างกระดาน" หรือไม่? \n(ลบรายการทั้งหมดของวันนี้ทิ้งโดยไม่บันทึกประวัติ)')) return;
    setGameHistory([]);
    setPaymentHistory([]);
    setCourts(INITIAL_COURTS);
    setSessionStartDate(null);
    setMembers(prev => prev.map(m => ({
      ...m,
      gamesPlayed: 0,
      balance: 0,
      courtBalance: 0,
      shuttleBalance: 0,
      shuttleCount: 0,
      snackBalance: 0,
      snackHistory: [],
      paidCourtFee: false,
      status: 'resting',
      checkInTime: Date.now(),
      totalCourt: 0,
      totalShuttle: 0,
      totalSnack: 0
    })));
  };

  const updateGame = (gameId: string, newPlayerIds: string[], newShuttles: number) => {
    const game = gameHistory.find(g => g.id === gameId);
    if (!game) return;

    const oldPlayerIds = game.players.map(p => p.id);
    const oldShuttles = game.shuttlesUsed;
    const oldShuttleCost = game.shuttleCostPerPerson;
    const oldCourtFee = game.courtFeePerPerson || 0;

    const newShuttleCost = newShuttles * effShuttlePrice;
    
    setMembers(prev => prev.map(m => {
      let updated = { ...m };
      
      // 1. Refund old players
      if (oldPlayerIds.includes(m.id)) {
        updated.balance -= (oldShuttleCost + oldCourtFee);
        updated.shuttleBalance -= oldShuttleCost;
        updated.courtBalance -= oldCourtFee;
        updated.shuttleCount = Math.max(0, updated.shuttleCount - oldShuttles);
        updated.gamesPlayed = Math.max(0, updated.gamesPlayed - 1);
        updated.totalCourt = Math.max(0, (updated.totalCourt || 0) - oldCourtFee);
        updated.totalShuttle = Math.max(0, (updated.totalShuttle || 0) - oldShuttleCost);
        // Important: if they no longer have any games, reset paidCourtFee
        if (updated.gamesPlayed === 0) updated.paidCourtFee = false;
      }

      // 2. Charge new players
      if (newPlayerIds.includes(m.id)) {
        const chargeField = updated.paidCourtFee ? 0 : entryFee;
        updated.balance += (newShuttleCost + chargeField);
        updated.shuttleBalance += newShuttleCost;
        updated.courtBalance += chargeField;
        updated.shuttleCount += newShuttles;
        updated.gamesPlayed += 1;
        updated.paidCourtFee = true;
        updated.totalCourt = (updated.totalCourt || 0) + chargeField;
        updated.totalShuttle = (updated.totalShuttle || 0) + newShuttleCost;
      }

      return updated;
    }));

    setGameHistory(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      const newPlayers = newPlayerIds.map(pid => {
        const p = members.find(px => px.id === pid)!;
        return { id: pid, name: p.name, rank: p.rank };
      });
      return { 
        ...g, 
        players: newPlayers, 
        shuttlesUsed: newShuttles, 
        shuttleCostPerPerson: newShuttleCost,
        courtFeePerPerson: oldCourtFee // Keep old charge status or update? safest to keep logic consistent
      };
    }));
  };

  const addMember = (name: string, rank: Rank) => {
    const existing = members.find(m => m.name.toLowerCase() === name.toLowerCase());

    // Auto-update rank memory when a member is added manually
    setRankMemory(prev => ({ ...prev, [name]: rank }));
    // บันทึกวันเริ่มต้นก๊วนถ้ายังไม่มี
    setSessionStartDate(prev => prev ?? Date.now());

    if (existing) {
      if (existing.status === 'waiting') {
        alert('ผู้เล่นนี้อยู่ในคิวแล้ว!');
        return;
      }
      setMembers(prev => prev.map(m => m.name.toLowerCase() === name.toLowerCase()
        ? { 
            ...m, 
            status: 'waiting', 
            checkInTime: Date.now(), 
            rank,
            balance: 0,
            courtBalance: 0,
            shuttleBalance: 0,
            snackBalance: 0,
            shuttleCount: 0,
            gamesPlayed: 0,
            snackHistory: [],
            paidCourtFee: false,
            totalCourt: 0,
            totalShuttle: 0,
            totalSnack: 0
          }
        : m
      ));
    } else {
      setMembers(prev => [...prev, mkMember(`m-${Date.now()}`, name, rank, 0, prev.length * 1000)]);
    }
    setShowAddMember(false);
  };

  const checkInMember = (memberId: string) => {
    setMembers(prev => prev.map(m => m.id === memberId
      ? { ...m, status: 'waiting', checkInTime: Date.now() }
      : m));
  };

  const removeFromSession = (memberId: string) => {
    if (!confirm('ยืนยันการลบรายชื่อออกจากเซสชันวันนี้?')) return;
    setCourts(prev => prev.map(c => ({ ...c, players: c.players.map(p => p === memberId ? null : p) })));
    setMembers(prev => prev.map(m => m.id === memberId ? {
      ...m,
      status: 'resting',
      gamesPlayed: 0,
      balance: 0,
      courtBalance: 0,
      shuttleBalance: 0,
      shuttleCount: 0,
      snackBalance: 0,
      snackHistory: [],
      paidCourtFee: false
    } : m));
  };

  const pullSessionData = async (date: string) => {
    setIsSyncing(true);
    try {
      const res = await apiFetch(`/session?date=${date}`);
      if (!res.ok) throw new Error('API return error');
      const data = await res.json();
      if (data && data.date) {
        const session: SessionRecord = {
          id: data.id,
          date: data.date,
          membersSnapshot: data.membersSnapshot || [],
          gameHistory: data.gameHistory || [],
          paymentHistory: data.paymentHistory || []
        };
        setSessionHistory(prev => {
          const filtered = prev.filter(s => format(s.date, 'yyyy-MM-dd') !== date);
          return [session, ...filtered];
        });
        setViewingSession(session);
        return session;
      }
    } catch (err) {
      console.error('Pull Session Error:', err);
      alert('ไม่สามารถดึงข้อมูลประวัติจากฐานข้อมูลได้');
    } finally {
      setIsSyncing(false);
    }
  };

  const seedMockHistory = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(19, 0, 0, 0);

    const mockMembers: Member[] = [
      { id: 'mock-1', name: 'คุณสมชาย (ทดสอบ)', rank: 'S1', gamesPlayed: 4, checkInTime: yesterday.getTime(), status: 'resting', balance: 0, courtBalance: 160, shuttleBalance: 75, snackBalance: 20, shuttleCount: 3, snackHistory: [{ id: 's1', name: 'น้ำเปล่า', price: 20, time: yesterday.getTime() + 100000 }], paidCourtFee: true },
      { id: 'mock-2', name: 'คุณสมศรี (ทดสอบ)', rank: 'P', gamesPlayed: 2, checkInTime: yesterday.getTime(), status: 'resting', balance: 140, courtBalance: 80, shuttleBalance: 50, snackBalance: 10, shuttleCount: 2, snackHistory: [{ id: 's2', name: 'กล้วยทอด', price: 10, time: yesterday.getTime() + 200000 }], paidCourtFee: false }
    ];

    const mockGames: GameRecord[] = [
      { id: 'g-mock-1', courtId: 'c1', courtName: 'คอร์ด 1', playedAt: yesterday.getTime() + 3600000, players: [{ id: 'mock-1', name: 'คุณสมชาย (ทดสอบ)', rank: 'S1' }, { id: 'mock-2', name: 'คุณสมศรี (ทดสอบ)', rank: 'P' }], shuttlesUsed: 2, shuttleCostPerPerson: 25, courtFeePerPerson: 40 }
    ];

    const mockPayments: PaymentRecord[] = [
      { id: 'p-mock-1', memberId: 'mock-1', memberName: 'คุณสมชาย (ทดสอบ)', memberRank: 'S1', amount: 255, timestamp: yesterday.getTime() + 7200000, method: 'Cash', note: '4 เกม' }
    ];

    const newSession: SessionRecord = {
      id: `session-mock-${yesterday.getTime()}`,
      date: yesterday.getTime(),
      membersSnapshot: mockMembers,
      gameHistory: mockGames,
      paymentHistory: mockPayments
    };

    setSessionHistory(prev => [newSession, ...prev]);
    alert('สร้างข้อมูลจำลองของ "เมื่อวาน" เรียบร้อยแล้ว! \nตอนนี้คุณสามารถเลือกวันที่จากเมนูด้านบนเพื่อทดสอบปุ่ม "Sync Now" หรือดูข้อมูลย้อนหลังได้เลยครับ');
  };

  const saveSession = (): SessionRecord | null => {
    if (gameHistory.length === 0 && paymentHistory.length === 0) return null;
    // ใช้ sessionStartDate แทน Date.now() เพื่อแก้ปัญหาเลยเที่ยงคืน
    const session: SessionRecord = {
      id: Math.random().toString(36).substr(2, 9),
      date: sessionStartDate || Date.now(),
      gameHistory: [...gameHistory],
      paymentHistory: [...paymentHistory],
      membersSnapshot: [...members],
      mode: activeMode,
      modeConfig
    };
    setSessionHistory(prev => [session, ...prev]);
    return session;
  };

  const factoryReset = () => {
    if (!confirm('!!! คำเตือน !!! คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด? ข้อมูลสมาชิกและประวัติทั้งหมดจะหายไป')) return;
    location.reload();
  };

  const changePin = async (pin: string): Promise<boolean> => {
    try {
      const res = await apiJson('/pin', { pin });
      return res.ok;
    } catch { return false; }
  };

  const logout = () => {
    clearToken();
    location.reload();
  };

  const switchGroup = () => {
    location.href = window.location.pathname;
  };

  const getWaitingList = useMemo(() => {
    const minW = RANK_WEIGHTS[minRankFilter] || 0;
    const maxW = RANK_WEIGHTS[maxRankFilter] || 15;
    const lower = Math.min(minW, maxW);
    const upper = Math.max(minW, maxW);

    return members
      .filter(m => m.status === 'waiting')
      .filter(m => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        return m.name.toLowerCase().includes(query);
      })
      .filter(m => {
        const w = RANK_WEIGHTS[m.rank] || 0;
        return w >= lower && w <= upper;
      })
      .sort((a, b) => a.gamesPlayed !== b.gamesPlayed ? a.gamesPlayed - b.gamesPlayed : a.checkInTime - b.checkInTime);
  }, [members, searchQuery, minRankFilter, maxRankFilter]);
  // ── AUTO MATCH ──────────────────────────────────────────────────────────────
  // กฎ: คนเล่นน้อยลงก่อน | มือเดียวกันได้ ต่างกันได้ไม่เกิน 2 ระดับ | จัดทีมสมดุล
  const autoMatch = (courtId: string) => {
    const court = courts.find(c => c.id === courtId);
    if (!court) return;

    const emptySlotIndices = court.players.map((p, i) => p === null ? i : -1).filter(i => i !== -1);
    if (emptySlotIndices.length === 0) { alert('คอร์ดเต็มแล้ว!'); return; }

    const needed = emptySlotIndices.length;
    const waiting = getWaitingList.filter(m => !court.players.includes(m.id));
    // getWaitingList เรียงตาม gamesPlayed น้อย→มาก อยู่แล้ว

    if (waiting.length < needed) {
      alert(`คนในคิวไม่พอ (ต้องการ ${needed} คน มีแค่ ${waiting.length} คน)`);
      return;
    }

    const getW = (pid: string | null) => {
      if (!pid) return 0;
      const m = members.find(x => x.id === pid);
      return m ? (RANK_WEIGHTS[m.rank] || 0) : 0;
    };

    // ── ถ้าเติมแค่ 1-2 คน: เอาต้นคิวตรงๆ ──────────────────────────────────
    if (needed < 4) {
      const candidates = waiting.slice(0, needed);
      const newPlayers = [...court.players];
      emptySlotIndices.forEach((idx, i) => { newPlayers[idx] = candidates[i].id; });
      setCourts(prev => prev.map(c => c.id === courtId ? { ...c, players: newPlayers } : c));
      setMembers(prev => prev.map(m => candidates.some(c => c.id === m.id) ? { ...m, status: 'playing' } : m));
      return;
    }

    // ── ต้องการ 4 คน: หาชุดที่ดีที่สุดจาก pool ──────────────────────────────
    // pool = 8 คนต้นคิว (เล่นน้อยสุด) เพื่อให้คนเล่นน้อยมีโอกาสสูงได้ลง
    const POOL_SIZE = Math.min(8, waiting.length);
    const pool = waiting.slice(0, POOL_SIZE);

    // combinations C(pool, 4)
    const getCombinations = (arr: typeof pool, k: number): (typeof pool)[] => {
      if (k === 0) return [[]];
      if (arr.length < k) return [];
      const [first, ...rest] = arr;
      return [
        ...getCombinations(rest, k - 1).map(c => [first, ...c]),
        ...getCombinations(rest, k),
      ];
    };
    const combos = getCombinations(pool, 4);

    // ── Scoring (ต่ำ = ดี) ────────────────────────────────────────────────────
    const scoreCombination = (group: typeof pool): number => {
      const weights = group.map(m => getW(m.id));

      // หา team split ที่สมดุลที่สุดใน 3 วิธี
      const splits = [
        Math.abs(weights[0]+weights[1] - weights[2]-weights[3]),
        Math.abs(weights[0]+weights[2] - weights[1]-weights[3]),
        Math.abs(weights[0]+weights[3] - weights[1]-weights[2]),
      ];
      const teamDiff = Math.min(...splits);              // ผลต่างทีม (0=ดี)

      // range ระดับทั้ง 4 คน
      const maxW = Math.max(...weights);
      const minW = Math.min(...weights);
      const rankRange = maxW - minW;
      // ยอมต่างกันได้ 2 ระดับ เกิน 2 โทษหนัก
      const rangePenalty = Math.max(0, rankRange - 2) * 6;

      // โบนัสถ้าใช้ 2 คนต้นคิวจริงๆ (ประกันว่าคนรอนานได้ลง)
      const hasTop2 = group.some(m => m.id === pool[0].id) && group.some(m => m.id === pool[1].id);
      const top2Bonus = hasTop2 ? 0 : 4;

      // penalize คนที่เล่นเยอะเกินกว่าค่าเฉลี่ยใน pool
      const avgGames = pool.reduce((a, m) => a + m.gamesPlayed, 0) / pool.length;
      const gamesPenalty = group.reduce((sum, m) => sum + Math.max(0, m.gamesPlayed - avgGames), 0) * 0.4;

      return teamDiff + rangePenalty + top2Bonus + gamesPenalty;
    };

    let bestCombo = combos[0];
    let bestScore = Infinity;
    for (const combo of combos) {
      const score = scoreCombination(combo);
      if (score < bestScore) { bestScore = score; bestCombo = combo; }
    }

    // จัด team split ที่สมดุลที่สุดสำหรับ bestCombo
    const bw = bestCombo.map(m => ({ id: m.id, w: getW(m.id) }));
    const allSplits = [
      { order: [bw[0].id, bw[1].id, bw[2].id, bw[3].id], diff: Math.abs(bw[0].w+bw[1].w - bw[2].w-bw[3].w) },
      { order: [bw[0].id, bw[2].id, bw[1].id, bw[3].id], diff: Math.abs(bw[0].w+bw[2].w - bw[1].w-bw[3].w) },
      { order: [bw[0].id, bw[3].id, bw[1].id, bw[2].id], diff: Math.abs(bw[0].w+bw[3].w - bw[1].w-bw[2].w) },
    ];
    const finalIds = allSplits.reduce((best, s) => s.diff < best.diff ? s : best).order;

    const newPlayers = [...court.players];
    emptySlotIndices.forEach((idx, i) => { newPlayers[idx] = finalIds[i]; });
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, players: newPlayers } : c));
    setMembers(prev => prev.map(m => finalIds.includes(m.id) ? { ...m, status: 'playing' } : m));
  };

  // ── START GAME: commit 4 players, auto-count 1 shuttle ────────────────────
  const startGame = (courtId: string) => {
    const court = courts.find(c => c.id === courtId);
    if (!court) return;
    const playerIds = court.players.filter(Boolean) as string[];
    if (playerIds.length !== 4) { alert('ต้องมีผู้เล่นครบ 4 คนพอดี'); return; }
    setCourts(prev => prev.map(c =>
      c.id === courtId ? { ...c, status: 'active' } : c
    ));
  };

  // ── RESET COURT: record game, charge costs, clear ─────────────────────────
  const resetCourt = (courtId: string, score?: { scoreA: number; scoreB: number }) => {
    const court = courts.find(c => c.id === courtId);
    if (!court) return;
    const playerIds = court.players.filter(Boolean) as string[];
    // ค่าลูก = ลูก × shuttlePrice ต่อคน (ไม่หาร 4 เพราะ shuttlePrice คือราคาต่อคนอยู่แล้ว)
    const shuttleCostPerPerson = court.shuttlecocks * effShuttlePrice;

    const playerSnapshots = playerIds.map(pid => {
      const m = members.find(m => m.id === pid)!;
      return { id: pid, name: m.name, rank: m.rank };
    });
    const gameRec: GameRecord = {
      id: Math.random().toString(36).substr(2, 9),
      courtId, courtName: court.name,
      playedAt: Date.now(),
      players: playerSnapshots,
      shuttlesUsed: court.shuttlecocks,
      shuttleCostPerPerson,
      courtFeePerPerson: 0,
      ...(score ? { scoreA: score.scoreA, scoreB: score.scoreB } : {}),
    };

    setMembers(prev => prev.map(m => {
      if (!playerIds.includes(m.id)) return m;
      const courtCharge = m.paidCourtFee ? 0 : entryFee;
      return {
        ...m,
        status: 'waiting',
        gamesPlayed: m.gamesPlayed + 1,
        balance: m.balance + shuttleCostPerPerson + courtCharge,
        courtBalance: m.courtBalance + courtCharge,
        shuttleBalance: m.shuttleBalance + shuttleCostPerPerson,
        shuttleCount: m.shuttleCount + court.shuttlecocks,
        paidCourtFee: true,
        checkInTime: Date.now(),
        totalCourt: (m.totalCourt || 0) + courtCharge,
        totalShuttle: (m.totalShuttle || 0) + shuttleCostPerPerson,
      };
    }));

    const clearedCourts = courts.map(c =>
      c.id === courtId ? { ...c, players: [null, null, null, null], status: 'empty' as const, shuttlecocks: 1 } : c
    );
    setCourts(clearedCourts);
    setGameHistory(prev => [gameRec, ...prev]);
    confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });

    // ตรวจสอบ next queue slot
    const nextSlot = courtQueues[courtId]?.[0];
    if (nextSlot) {
      const emptyCourts = clearedCourts.filter(c => c.status === 'empty');
      setTimeout(() => setNextQueuePrompt({
        courtId,
        courtName: court.name,
        slot: nextSlot,
        emptyCourts,
      }), 400);
    }
  };

  // ── หารเท่า: เรียกเก็บ (ค่าสนาม + ค่าลูก) ÷ จำนวนคนที่ได้ลงเล่น ──────────────
  // เรียกซ้ำได้ — ย้อนยอดที่เคยเรียกเก็บไปก่อนแล้วค่อยคิดใหม่ (เช่นมีคนมาเพิ่มทีหลัง)
  const applySplit = () => {
    const prevApplied = modeConfig.splitApplied || {};
    const playing = members.filter(m => m.gamesPlayed > 0);
    if (playing.length === 0) { alert('ยังไม่มีผู้เล่นที่ได้ตี'); return; }
    const courtShare = Math.ceil(modeConfig.splitCourtTotal / playing.length);
    const shuttleShare = Math.ceil(modeConfig.splitShuttleTotal / playing.length);
    const applied: Record<string, { court: number; shuttle: number }> = {};
    setMembers(prev => prev.map(m => {
      const old = prevApplied[m.id] || { court: 0, shuttle: 0 };
      const isPlaying = m.gamesPlayed > 0;
      const court = isPlaying ? courtShare : 0;
      const shuttle = isPlaying ? shuttleShare : 0;
      if (isPlaying) applied[m.id] = { court, shuttle };
      const dCourt = court - old.court;
      const dShuttle = shuttle - old.shuttle;
      if (!dCourt && !dShuttle) return m;
      return {
        ...m,
        courtBalance: Math.max(0, m.courtBalance + dCourt),
        shuttleBalance: Math.max(0, m.shuttleBalance + dShuttle),
        balance: Math.max(0, m.balance + dCourt + dShuttle),
        totalCourt: Math.max(0, (m.totalCourt || 0) + dCourt),
        totalShuttle: Math.max(0, (m.totalShuttle || 0) + dShuttle),
        paidCourtFee: true,
      };
    }));
    setModeConfig(prev => ({ ...prev, splitApplied: applied }));
  };

  // ── COURT QUEUE MANAGEMENT ──────────────────────────────────────────────────
  const addToCourtQueue = (courtId: string, slot: CourtQueueSlot) => {
    setCourtQueues(prev => ({ ...prev, [courtId]: [...(prev[courtId] || []), slot] }));
  };

  const removeFromCourtQueue = (courtId: string, slotId: string) => {
    setCourtQueues(prev => ({ ...prev, [courtId]: (prev[courtId] || []).filter(s => s.id !== slotId) }));
  };

  const updateCourtQueueSlot = (courtId: string, slot: CourtQueueSlot) => {
    setCourtQueues(prev => ({
      ...prev,
      [courtId]: (prev[courtId] || []).map(s => s.id === slot.id ? slot : s),
    }));
  };

  const moveCourtQueueSlot = (courtId: string, slotId: string, dir: 'up' | 'down') => {
    setCourtQueues(prev => {
      const slots = [...(prev[courtId] || [])];
      const idx = slots.findIndex(s => s.id === slotId);
      if (idx === -1) return prev;
      const next = dir === 'up' ? idx - 1 : idx + 1;
      if (next < 0 || next >= slots.length) return prev;
      [slots[idx], slots[next]] = [slots[next], slots[idx]];
      return { ...prev, [courtId]: slots };
    });
  };

  const confirmNextQueue = (targetCourtId: string, slot: CourtQueueSlot, sourceCourtId: string) => {
    const court = courts.find(c => c.id === targetCourtId);
    if (!court) return;
    const allPlayers = [...slot.teamA, ...slot.teamB];
    const playerIds = allPlayers.map(p => p.memberId).filter(Boolean) as string[];
    const newPlayers: (string | null)[] = [
      slot.teamA[0]?.memberId || null,
      slot.teamA[1]?.memberId || null,
      slot.teamB[0]?.memberId || null,
      slot.teamB[1]?.memberId || null,
    ];
    setCourts(prev => prev.map(c =>
      c.id === targetCourtId ? { ...c, players: newPlayers, status: 'active' } : c
    ));
    setMembers(prev => prev.map(m =>
      playerIds.includes(m.id) ? { ...m, status: 'playing' } : m
    ));
    setCourtQueues(prev => ({
      ...prev,
      [sourceCourtId]: (prev[sourceCourtId] || []).filter(s => s.id !== slot.id),
    }));
    setNextQueuePrompt(null);
  };

  // Next-queue prompt: Esc dismisses, Enter starts at the suggested court (the default action)
  useModalHotkeys({
    onClose: () => setNextQueuePrompt(null),
    onSubmit: () => { if (nextQueuePrompt) confirmNextQueue(nextQueuePrompt.courtId, nextQueuePrompt.slot, nextQueuePrompt.courtId); },
    enabled: !!nextQueuePrompt,
  });

  // ── PLAYER MANAGEMENT ─────────────────────────────────────────────────────
  const removePlayerFromCourt = (courtId: string, slotIndex: number) => {
    const court = courts.find(c => c.id === courtId);
    if (!court) return;
    const pid = court.players[slotIndex];
    if (!pid) return;
    setCourts(prev => prev.map(c => c.id === courtId
      ? { ...c, players: c.players.map((p, i) => i === slotIndex ? null : p) } : c));
    setMembers(prev => prev.map(m => m.id === pid ? { ...m, status: 'waiting' } : m));
  };

  const addPlayerToCourt = (courtId: string, slotIndex: number, playerId: string) => {
    const court = courts.find(c => c.id === courtId);
    if (!court) return;

    // Get the player currently in that slot (if any)
    const oldPlayerId = court.players[slotIndex];

    setCourts(prev => prev.map(c => ({
      ...c,
      players: c.id === courtId
        ? c.players.map((p, i) => i === slotIndex ? playerId : p)
        : c.players.map(p => p === playerId ? null : p),
    })));

    setMembers(prev => prev.map(m => {
      // New player going in
      if (m.id === playerId) return { ...m, status: 'playing' };
      // Old player being kicked out of THIS slot
      if (m.id === oldPlayerId) return { ...m, status: 'waiting' };
      return m;
    }));
  };

  const addSnacksToMember = (memberId: string, addedSnacks: Snack[]) => {
    if (addedSnacks.length === 0) return;
    const totalExtraBalance = addedSnacks.reduce((sum, s) => sum + s.price, 0);
    const historyEntries = addedSnacks.map(s => ({ ...s, time: Date.now() }));

    setMembers(prev => prev.map(m => m.id === memberId ? {
      ...m,
      balance: m.balance + totalExtraBalance,
      snackBalance: m.snackBalance + totalExtraBalance,
      snackHistory: [...(m.snackHistory || []), ...historyEntries],
      totalSnack: (m.totalSnack || 0) + totalExtraBalance
    } : m));
  };

  const addSnackToMember = (memberId: string, snack: Snack) => {
    setMembers(prev => prev.map(m => m.id === memberId
      ? {
        ...m,
        balance: m.balance + snack.price,
        snackBalance: m.snackBalance + snack.price,
        snackHistory: [...m.snackHistory, { ...snack, time: Date.now() }],
        totalSnack: (m.totalSnack || 0) + snack.price
      }
      : m));
  };

  const removeSnackFromMember = (memberId: string, snackItemIndex: number) => {
    setMembers(prev => prev.map(m => {
      if (m.id !== memberId) return m;
      const snackToRemove = m.snackHistory[snackItemIndex];
      if (!snackToRemove) return m;
      const newHistory = [...m.snackHistory];
      newHistory.splice(snackItemIndex, 1);
      return {
        ...m,
        balance: m.balance - snackToRemove.price,
        snackBalance: m.snackBalance - snackToRemove.price,
        snackHistory: newHistory,
        totalSnack: Math.max(0, (m.totalSnack || 0) - snackToRemove.price)
      };
    }));
  };

  const updateSnackPrice = (memberId: string, itemIndex: number, newPrice: number) => {
    setMembers(prev => prev.map(m => {
      if (m.id !== memberId) return m;
      const snack = m.snackHistory[itemIndex];
      if (!snack) return m;
      const diff = newPrice - snack.price;
      const newHistory = [...m.snackHistory];
      newHistory[itemIndex] = { ...snack, price: newPrice };
      return {
        ...m,
        balance: m.balance + diff,
        snackBalance: m.snackBalance + diff,
        snackHistory: newHistory,
        totalSnack: (m.totalSnack || 0) + diff
      };
    }));
  };

  // ── EDIT GAME: ปรับลูกย้อนหลัง (คืนเงินส่วนต่าง/เรียกเก็บเพิ่ม) ──────────────
  const editGame = (gameId: string, newShuttles: number) => {
    const game = gameHistory.find(g => g.id === gameId);
    if (!game || newShuttles < 1) return;
    const oldShuttles = game.shuttlesUsed;
    const shuttleDiff = newShuttles - oldShuttles;
    const delta = shuttleDiff * effShuttlePrice;
    const playerIds = game.players.map(p => p.id);
    setMembers(prev => prev.map(m =>
      playerIds.includes(m.id)
        ? {
          ...m,
          balance: m.balance + delta,
          shuttleBalance: m.shuttleBalance + delta,
          shuttleCount: m.shuttleCount + shuttleDiff,
          totalShuttle: (m.totalShuttle || 0) + delta
        }
        : m
    ));
    setGameHistory(prev => prev.map(g =>
      g.id === gameId
        ? { ...g, shuttlesUsed: newShuttles, shuttleCostPerPerson: newShuttles * effShuttlePrice }
        : g
    ));
  };

  const updateMemberShuttles = (memberId: string, delta: number) => {
    setMembers(prev => prev.map(m => {
      if (m.id !== memberId) return m;
      const newCount = Math.max(0, m.shuttleCount + delta);
      const actualDelta = newCount - m.shuttleCount;
      const costChange = actualDelta * effShuttlePrice;
      return {
        ...m,
        shuttleCount: newCount,
        shuttleBalance: m.shuttleBalance + costChange,
        balance: m.balance + costChange,
        totalShuttle: (m.totalShuttle || 0) + costChange
      };
    }));
  };

  const undoGame = (gameId: string) => {
    const game = gameHistory.find(g => g.id === gameId);
    if (!game) return;
    if (!confirm(`ต้องการยกเลิกเกม "${game.courtName}" เมื่อเวลา ${format(game.playedAt, 'HH:mm')} ใช่หรือไม่?\n(ระบบจะคืนค่าลูกและค่าสนามให้ผู้เล่นทุกคน)`)) return;

    const playerIds = game.players.map(p => p.id);
    const numPlayers = game.players.length;
    const shuttleCost = game.shuttleCostPerPerson;
    const shuttlesPerPerson = game.shuttlesUsed / numPlayers;

    setMembers(prev => prev.map(m => {
      if (!playerIds.includes(m.id)) return m;

      const courtRefund = game.courtFeePerPerson || 0;

      return {
        ...m,
        gamesPlayed: Math.max(0, m.gamesPlayed - 1),
        balance: m.balance - shuttleCost - courtRefund,
        shuttleBalance: m.shuttleBalance - shuttleCost,
        shuttleCount: Math.max(0, m.shuttleCount - shuttlesPerPerson),
        courtBalance: m.courtBalance - courtRefund,
        paidCourtFee: (m.courtBalance - courtRefund) > 0,
        totalShuttle: Math.max(0, (m.totalShuttle || 0) - shuttleCost),
        totalCourt: Math.max(0, (m.totalCourt || 0) - courtRefund)
      };
    }));

    setGameHistory(prev => prev.filter(g => g.id !== gameId));

    // ถ้าคอร์ดว่าง เราอาจจะคืนผู้เล่นลงคอร์ด? 
    // แต่เพื่อความง่าย เราแค่คืนเงินและลบประวัติพอ
  };

  const updateMemberRank = (memberId: string, rank: Rank) => {
    setMembers(prev => prev.map(m => {
      if (m.id === memberId) {
        setRankMemory(prevMem => ({ ...prevMem, [m.name]: rank }));
        return { ...m, rank };
      }
      return m;
    }));
  };

  const updateMemberName = (memberId: string, name: string) => {
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, name } : m));
  };


  const processPayment = (memberId: string, amount: number, method: string = 'Cash', otherMemberIds: string[] = []) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;

    const allMemberIds = [memberId, ...otherMemberIds];
    const otherMembers = members.filter(m => otherMemberIds.includes(m.id));
    const otherNames = otherMembers.map(m => m.name).join(', ');

    // Check if partial
    const totalDebt = member.balance + otherMembers.reduce((sum, m) => sum + m.balance, 0);
    const isFullPayment = amount >= totalDebt;

    const note = otherMemberIds.length > 0
      ? `จ่ายรวม${isFullPayment ? '' : ' (บางส่วน)'}: ${otherNames}`
      : `${member.gamesPlayed} เกม${isFullPayment ? '' : ' (จ่ายบางส่วน)'}`;

    const recordDetails = {
      courtBalance: member.courtBalance + otherMembers.reduce((sum, m) => sum + m.courtBalance, 0),
      shuttleBalance: member.shuttleBalance + otherMembers.reduce((sum, m) => sum + m.shuttleBalance, 0),
      snackHistory: [
        ...member.snackHistory,
        ...otherMembers.flatMap(m => m.snackHistory)
      ]
    };

    const record: PaymentRecord = {
      id: Math.random().toString(36).substr(2, 9),
      memberId,
      memberName: member.name,
      memberRank: member.rank,
      amount,
      timestamp: Date.now(),
      method,
      note,
      details: recordDetails
    };

    setPaymentHistory(prev => [record, ...prev]);

    setMembers(prev => {
      let remainingPayment = amount;
      const next = [...prev];

      for (const id of allMemberIds) {
        const idx = next.findIndex(m => m.id === id);
        if (idx === -1) continue;
        const m = { ...next[idx] };

        if (remainingPayment <= 0) break;

        const debtToClear = Math.min(m.balance, remainingPayment);
        m.balance -= debtToClear;
        remainingPayment -= debtToClear;

        // Track who paid for whom
        if (id !== memberId && debtToClear > 0) {
          m.paidBy = memberId;
          m.paidByName = member.name;
        }

        if (m.balance <= 0) {
          m.balance = 0;
          m.courtBalance = 0;
          m.shuttleBalance = 0;
          m.snackBalance = 0;
          m.snackHistory = [];
          m.shuttleCount = 0;
          m.paidCourtFee = true;
          m.status = 'paid';
        } else {
          // Adjust granular balances down
          let leftToClear = debtToClear;

          const snackClear = Math.min(m.snackBalance, leftToClear);
          m.snackBalance -= snackClear;
          leftToClear -= snackClear;

          const courtClear = Math.min(m.courtBalance, leftToClear);
          m.courtBalance -= courtClear;
          leftToClear -= courtClear;

          const shuttleClear = Math.min(m.shuttleBalance, leftToClear);
          m.shuttleBalance -= shuttleClear;
          leftToClear -= shuttleClear;
        }

        next[idx] = m;
      }
      return next;
    });
  };

  const reOpenSession = (memberId: string) => {
    setMembers(prev => prev.map(m => m.id === memberId
      ? { ...m, status: 'waiting', checkInTime: Date.now() }
      : m));
  };

  const addCourt = (name: string) => {
    setCourts(prev => [...prev, { id: `c${Date.now()}`, name, players: [null, null, null, null], status: 'empty', shuttlecocks: 0 }]);
  };

  const deleteCourt = (courtId: string) => {
    const court = courts.find(c => c.id === courtId);
    const playerIds = (court?.players.filter(Boolean) as string[]) || [];
    if (playerIds.length > 0) setMembers(prev => prev.map(m => playerIds.includes(m.id) ? { ...m, status: 'waiting' } : m));
    setCourts(prev => prev.filter(c => c.id !== courtId));
  };



  const importMembers = (list: { name: string; rank: Rank }[], isSessionImport = false) => {
    // บันทึกวันเริ่มต้นก๊วนถ้ายังไม่มีและเป็น session import
    if (isSessionImport) setSessionStartDate(prev => prev ?? Date.now());
    const status: Member['status'] = isSessionImport ? 'waiting' : 'resting';

    setRankMemory(prev => {
      const next = { ...prev };
      list.forEach(item => { next[item.name] = item.rank; });
      return next;
    });

    setMembers(prev => {
      const now = Date.now();
      const current = [...prev];

      list.forEach((item, i) => {
        const existingIndex = current.findIndex(m => m.name.trim().toLowerCase() === item.name.trim().toLowerCase());
        if (existingIndex !== -1) {
          // Update details and check-in if it's a session import
          current[existingIndex] = {
            ...current[existingIndex],
            rank: item.rank,
            status: isSessionImport ? 'waiting' : current[existingIndex].status,
            checkInTime: isSessionImport ? (now + i) : current[existingIndex].checkInTime,
            ...(isSessionImport ? {
              balance: 0,
              courtBalance: 0,
              shuttleBalance: 0,
              snackBalance: 0,
              shuttleCount: 0,
              gamesPlayed: 0,
              snackHistory: [],
              paidCourtFee: false,
              totalCourt: 0,
              totalShuttle: 0,
              totalSnack: 0
            } : {})
          };
        } else {
          // New member
          current.push({
            id: Math.random().toString(36).substr(2, 9),
            name: item.name,
            rank: item.rank,
            gamesPlayed: 0,
            checkInTime: now + i,
            status: status,
            balance: 0, courtBalance: 0, shuttleBalance: 0, snackBalance: 0,
            shuttleCount: 0,
            snackHistory: [],
            paidCourtFee: false,
            totalCourt: 0, totalShuttle: 0, totalSnack: 0,
          });
        }
      });
      // Sync to cloud removed
      return current;
    });
  };

  const removeMember = (memberId: string) => {
    if (!confirm('ยืนยันการลบสมาชิกออกจากฐานข้อมูลถาวร? (จะหายไปจาก Cloud ด้วย)')) return;
    setCourts(prev => prev.map(c => ({ ...c, players: c.players.map(p => p === memberId ? null : p) })));
    setMembers(prev => {
      const next = prev.filter(m => m.id !== memberId);
      return next;
    });
  };

  const bulkCheckIn = (memberIds: string[]) => {
    setMembers(prev => prev.map(m => memberIds.includes(m.id) ? { ...m, status: 'waiting', checkInTime: Date.now() } : m));
  };

  const bulkRemove = (memberIds: string[]) => {
    if (!confirm(`ยืนยันการลบสมาชิก ${memberIds.length} คนออกจากฐานข้อมูลถาวร? (จะหายไปจาก Cloud ด้วย)`)) return;
    setCourts(prev => prev.map(c => ({ ...c, players: c.players.map(p => memberIds.includes(p as string) ? null : p) })));
    setMembers(prev => {
      const next = prev.filter(m => !memberIds.includes(m.id));
      return next;
    });
  };

  const bulkUpdateRank = (memberIds: string[], rank: Rank) => {
    setMembers(prev => {
      const next = prev.map(m => memberIds.includes(m.id) ? { ...m, rank } : m);
      return next;
    });
    const names = members.filter(m => memberIds.includes(m.id)).map(m => m.name);
    setRankMemory(prev => {
      const next = { ...prev };
      names.forEach(n => next[n] = rank);
      return next;
    });
  };

  const tabs = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'หน้าหลัก', hint: 'ดูยอดเงินและคนที่มาตีวันนี้' },
    { id: 'courts', icon: Trophy, label: 'จัดคอร์ท', hint: 'จัดคนลงสนาม เริ่ม/จบเกม' },
    { id: 'logs', icon: History, label: 'ประวัติ', hint: 'เกมที่ตีไปแล้ว' },
    { id: 'stats', icon: BarChart3, label: 'สถิติ', hint: 'แพ้-ชนะ อันดับ' },
    { id: 'members', icon: Users, label: 'สมาชิก', hint: 'เพิ่ม/แก้ไขรายชื่อคนในก๊วน' },
    { id: 'settings', icon: Settings, label: 'ตั้งค่า', hint: 'ราคา ค่าสนาม ประกาศหาสมาชิก' },
  ];

  return (
    <>
      <AnimatePresence>
        {isInitialLoading && <SplashScreen key="splash" groupName={groupName} />}
      </AnimatePresence>
      {!isInitialLoading && needsName && <GroupNameSetup onSave={onRename} />}
      {!isInitialLoading && !needsName && sessionMode === null && (
        <ModePicker initialConfig={modeConfig} onPick={(m, cfg) => { setModeConfig(prev => ({ ...prev, ...cfg })); setSessionMode(m); }} />
      )}

      {/* Next Queue Prompt Overlay */}
      <AnimatePresence>
        {nextQueuePrompt && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4"
          >
            <motion.div className="absolute inset-0 bg-on-surface/50 backdrop-blur-sm" onClick={() => setNextQueuePrompt(null)} />
            <motion.div
              initial={{ y: 60, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 60, opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-[2rem] p-6 w-full max-w-md shadow-2xl z-10"
            >
              <div className="text-center mb-5">
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl">⏭</span>
                </div>
                <h3 className="font-headline font-black text-2xl">มีคิวถัดไป!</h3>
                <p className="text-sm text-on-surface/50 mt-1">{nextQueuePrompt.courtName}</p>
              </div>

              {/* Players preview */}
              <div className="bg-background rounded-2xl p-4 mb-5">
                <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                  <div className="space-y-1.5">
                    {nextQueuePrompt.slot.teamA.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0', RANK_COLORS[p.rank])}>{p.rank}</span>
                        <span className="font-bold text-sm truncate">{p.name}</span>
                      </div>
                    ))}
                  </div>
                  <span className="text-on-surface/20 font-black text-xs text-center">VS</span>
                  <div className="space-y-1.5">
                    {nextQueuePrompt.slot.teamB.map((p, i) => (
                      <div key={i} className="flex items-center justify-end gap-2">
                        <span className="font-bold text-sm truncate">{p.name}</span>
                        <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0', RANK_COLORS[p.rank])}>{p.rank}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {nextQueuePrompt.slot.note && (
                  <p className="text-xs text-on-surface/40 text-center mt-2 border-t border-on-surface/5 pt-2">{nextQueuePrompt.slot.note}</p>
                )}
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => confirmNextQueue(nextQueuePrompt.courtId, nextQueuePrompt.slot, nextQueuePrompt.courtId)}
                  className="w-full bg-primary text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  เริ่มตีที่{nextQueuePrompt.courtName}เลย
                </button>
                {nextQueuePrompt.emptyCourts.filter(c => c.id !== nextQueuePrompt.courtId).map(c => (
                  <button key={c.id}
                    onClick={() => confirmNextQueue(c.id, nextQueuePrompt.slot, nextQueuePrompt.courtId)}
                    className="w-full bg-secondary/10 text-secondary py-3 rounded-2xl font-bold text-sm hover:bg-secondary/20 transition-all"
                  >
                    ย้ายไปตีที่ {c.name} แทน
                  </button>
                ))}
                <button
                  onClick={() => setNextQueuePrompt(null)}
                  className="w-full py-3 rounded-2xl font-bold text-sm text-on-surface/40 hover:bg-on-surface/5 transition-all"
                >
                  ข้ามไปก่อน
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-screen bg-background flex flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className={cn(
          "hidden lg:flex flex-col fixed left-0 top-0 h-screen bg-primary text-on-primary transition-all duration-300 z-[100]",
          isSidebarCollapsed ? "w-20 p-3" : "w-72 p-5"
        )}>
          <div className={cn("mb-6 flex transition-all", isSidebarCollapsed ? "flex-col items-center gap-3 pt-3" : "items-center gap-3 px-1 pt-5")}>
            <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center text-white font-black italic text-2xl shrink-0">{groupName.charAt(0).toUpperCase()}</div>
            {!isSidebarCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-w-0 flex-1">
                <h4 className="font-headline font-black text-xl text-white tracking-tight line-clamp-2 break-words">{groupName}</h4>
                <p className="text-xs font-semibold text-white/60">SmashPang</p>
                {schedule.map((s, i) => <p key={i} className="text-xs font-bold text-white/60">{formatSlot(s)}</p>)}
              </motion.div>
            )}
            <button onClick={toggleSidebar}
              title={isSidebarCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'} aria-label={isSidebarCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
              className="w-9 h-9 shrink-0 rounded-xl bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors">
              {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
          </div>

          <nav className="flex-1 space-y-1.5" aria-label="เมนูหลัก">
            {tabs.map(item => {
              const on = activeTab === item.id;
              return (
                <button key={item.id} onClick={() => setActiveTab(item.id as Tab)}
                  title={isSidebarCollapsed ? `${item.label} — ${item.hint}` : item.hint}
                  aria-current={on ? 'page' : undefined}
                  className={cn('relative w-full flex items-center rounded-xl transition-all duration-200',
                    isSidebarCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                    on ? 'bg-white text-primary shadow-md' : 'text-white/75 hover:text-white hover:bg-white/10')}>
                  {on && <span className="absolute -left-3 top-2 bottom-2 w-1.5 rounded-r-full bg-primary-container" />}
                  <span className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors', on ? 'bg-primary text-white' : 'bg-white/10')}>
                    <item.icon size={21} />
                  </span>
                  {!isSidebarCollapsed && (
                    <span className="flex-1 min-w-0 text-left leading-tight">
                      <span className="block font-headline font-black text-base">{item.label}</span>
                      <span className={cn('block text-[11px] font-semibold truncate', on ? 'text-primary/60' : 'text-white/50')}>{item.hint}</span>
                    </span>
                  )}
                  {!isSidebarCollapsed && TAB_SHORTCUTS[item.id as Tab] && (
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0',
                      on ? 'border-primary/25 text-primary/60' : 'border-white/25 text-white/50')}>
                      {TAB_SHORTCUTS[item.id as Tab]}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto pt-4 border-t border-white/15 space-y-3">
            {!isSidebarCollapsed ? (
              <div className="bg-white/10 p-4 rounded-2xl">
                <p className="text-xs font-bold text-white/70 mb-1">รายรับวันนี้</p>
                <p className="text-2xl font-headline font-black text-white">
                  ฿{(members.reduce((a, m) => a + m.balance, 0) + paymentHistory.reduce((a, r) => a + r.amount, 0)).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="flex justify-center text-white" title="รายรับวันนี้">
                <Banknote size={22} />
              </div>
            )}

            <button onClick={() => setShowManageProducts(true)}
              title={isSidebarCollapsed ? "จัดการสินค้า" : ""}
              className={cn("w-full flex items-center text-white/75 font-semibold text-[15px] hover:bg-white/10 rounded-xl transition-colors",
                isSidebarCollapsed ? "justify-center p-3.5" : "gap-3.5 px-4 py-3")}>
              <ShoppingCart size={20} className="shrink-0" />
              {!isSidebarCollapsed && <span>จัดการสินค้า</span>}
            </button>


            {/* Cloud Status Indicator */}
            <div className="px-4 pb-5">
              <div className="flex items-center gap-2.5">
                <div className="relative flex items-center justify-center shrink-0">
                  <div className={cn("w-3 h-3 rounded-full transition-all duration-500", isSyncing ? "bg-primary animate-pulse scale-110" : "bg-green-500")} />
                  {isSyncing && <div className="absolute inset-0 w-3 h-3 rounded-full bg-primary animate-ping opacity-40" />}
                </div>
                {!isSidebarCollapsed && (
                  <div className="flex flex-col">
                    <span className={cn("text-[11px] font-semibold transition-colors duration-300", isSyncing ? "text-white" : "text-white/60")}>
                      {isSyncing ? "กำลังซิงค์ข้อมูล..." : "เชื่อมต่อแล้ว"}
                    </span>
                    {lastAutoSave && !isSyncing && (
                      <span className="text-[10px] text-white/40">
                        บันทึกล่าสุด {lastAutoSave.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        </aside>

        {/* Main Container */}
        <div className={cn(
          "flex-1 transition-all duration-300",
          isSidebarCollapsed ? "lg:ml-20" : "lg:ml-72"
        )}>
          {/* Modals */}
          <AddMemberModal
            open={showAddMember}
            onClose={() => setShowAddMember(false)}
            onAdd={addMember}
            existingNames={members.map(m => m.name)}
            rankMemory={rankMemory}
          />
          <AddCourtModal open={showAddCourt} onClose={() => setShowAddCourt(false)} onAdd={addCourt} />
          <ManageProductsModal open={showManageProducts} onClose={() => setShowManageProducts(false)} snacks={snacks} onSave={setSnacks} />
          <ImportMembersModal
            open={showImport}
            onClose={() => setShowImport(false)}
            onImport={importMembers}
            rankMemory={rankMemory}
            existingNames={members.map(m => m.name)}
            isSessionMode={importIsSession}
          />

          {/* Main Content Area */}
          <main className="p-4 md:p-6 court-texture pb-24 md:pb-6 md:pt-[4.5rem] lg:pt-6 min-h-screen">
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                {activeTab === 'dashboard' && (
                  <DashboardTab 
                    members={members} courts={courts} snacks={snacks} 
                    paymentHistory={paymentHistory} gameHistory={gameHistory}
                    onUpdateRank={updateMemberRank}
                    onRemoveSnack={removeSnackFromMember}
                    onUpdateSnackPrice={updateSnackPrice}
                    viewingSession={viewingSession}
                    onCloseSession={() => setViewingSession(null)}
                    sessionHistory={sessionHistory}
                    onViewSession={(s) => setViewingSession(s)}
                    onProcessPayment={processPayment}
                    onReOpen={reOpenSession}
                    onPullSession={pullSessionData}
                    isSyncing={isSyncing}
                    onAddCourt={() => setShowAddCourt(true)}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onCheckIn={checkInMember}
                    onRemove={removeFromSession}
                    onResetDay={resetDay}
                    onClearBoard={clearBoard}
                    onUpdateGame={updateGame}
                    onAddSnack={addSnacksToMember}
                    onImportLine={() => { setImportIsSession(true); setShowImport(true); }}
                    sessionStartDate={sessionStartDate}
                  />
                )}
                {activeTab === 'logs' && (
                  <LogsTab
                    gameHistory={gameHistory}
                    sessionHistory={sessionHistory}
                    members={members}
                    paymentHistory={paymentHistory}
                    onViewSession={setViewingSession}
                    onActiveTab={setActiveTab}
                    onUpdateGame={updateGame}
                    onPullSession={pullSessionData}
                  />
                )}
                {activeTab === 'stats' && (
                  <StatsTab
                    members={members}
                    gameHistory={gameHistory}
                    sessionHistory={sessionHistory}
                    paymentHistory={paymentHistory}
                    sessionStartDate={sessionStartDate}
                    mode={activeMode}
                    modeConfig={modeConfig}
                    onApplySplit={applySplit}
                    onChangeConfig={patch => setModeConfig(prev => ({ ...prev, ...patch }))}
                  />
                )}
                {activeTab === 'members' && (
                  <MembersTab
                    members={members}
                    searchQuery={searchQuery}
                    onSearch={setSearchQuery}
                    onRemove={removeMember}
                    onAddMember={() => { setImportIsSession(false); setShowAddMember(true); }}
                    onImportLine={() => { setImportIsSession(false); setShowImport(true); }}
                    onUpdateRank={updateMemberRank}
                    onUpdateName={updateMemberName}
                    onAddCourt={() => setShowAddCourt(true)}
                    onCheckIn={checkInMember}
                    onBulkCheckIn={bulkCheckIn}
                    onBulkRemove={bulkRemove}
                    onBulkUpdateRank={bulkUpdateRank}
                  />
                )}
                {activeTab === 'courts' && (
                  <CourtsTab
                    members={members} courts={courts} snacks={snacks}
                    searchQuery={searchQuery} gameHistory={gameHistory}
                    onAutoMatch={autoMatch} onStartGame={startGame} onResetCourt={resetCourt}
                    onRemovePlayer={removePlayerFromCourt} onAddPlayer={addPlayerToCourt}
                    onDeleteCourt={deleteCourt} onAddSnack={addSnacksToMember}
                    onEditGame={editGame} onUndoGame={undoGame} onUpdateCourt={setCourts}
                    minRankFilter={minRankFilter} setMinRankFilter={setMinRankFilter}
                    maxRankFilter={maxRankFilter} setMaxRankFilter={setMaxRankFilter}
                    onAddCourt={() => setShowAddCourt(true)}
                    courtQueues={courtQueues}
                    onAddCourtQueue={addToCourtQueue}
                    onRemoveCourtQueue={removeFromCourtQueue}
                    onUpdateCourtQueue={updateCourtQueueSlot}
                    onMoveCourtQueue={moveCourtQueueSlot}
                    sessionMode={activeMode}
                    askScore={activeMode === 'fun' || modeConfig.trackScore}
                    shuttleChargePerShuttle={effShuttlePrice}
                  />
                )}
                {activeTab === 'settings' && (
                  <SettingsTab
                    courtFeePerPerson={courtFeePerPerson}
                    setCourtFeePerPerson={setCourtFeePerPerson}
                    shuttlePrice={shuttlePrice}
                    setShuttlePrice={setShuttlePrice}
                    sessionMode={activeMode}
                    setSessionMode={setSessionMode}
                    modeConfig={modeConfig}
                    setModeConfig={setModeConfig}
                    onSeedMockHistory={seedMockHistory}
                    onResetDay={resetDay}
                    onFactoryReset={factoryReset}
                    rankMemory={rankMemory}
                    onChangePin={changePin}
                    onLogout={logout}
                    onSwitchGroup={switchGroup}
                    queueUrl={`${window.location.origin}${groupUrl(getGroupId(), '&queue')}`}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        {/* Tablet Nav — md to lg */}
        <nav className="hidden md:flex lg:hidden fixed top-0 left-0 right-0 z-[100] bg-white/95 backdrop-blur-xl border-b border-on-surface/8 shadow-sm h-14 items-center px-4 gap-2">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0 mr-3">
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center text-white font-black italic text-sm shadow-md shadow-primary/25">{groupName.charAt(0).toUpperCase()}</div>
            <span className="font-headline font-black text-base text-on-surface truncate max-w-[10rem]">{groupName}</span>
          </div>

          {/* Tabs */}
          <div className="flex flex-1 gap-1 overflow-x-auto no-scrollbar">
            {tabs.map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id as Tab)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all whitespace-nowrap shrink-0',
                  activeTab === item.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-on-surface/50 hover:text-on-surface hover:bg-on-surface/5'
                )}>
                <item.icon size={17} className="shrink-0" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button onClick={() => setShowManageProducts(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-on-surface/50 hover:text-primary hover:bg-primary/5 transition-all whitespace-nowrap">
              <ShoppingCart size={17} /> สินค้า
            </button>
            <button onClick={() => { setImportIsSession(false); setShowImport(true); }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-on-surface/50 hover:text-secondary hover:bg-secondary/5 transition-all whitespace-nowrap">
              <FileText size={17} /> นำเข้า
            </button>
            <div className="flex items-center gap-1.5 px-3 py-2">
              <div className={cn('w-2 h-2 rounded-full', isSyncing ? 'bg-primary animate-pulse' : 'bg-green-500')} />
            </div>
          </div>
        </nav>

        {/* Mobile Nav — below md */}
        <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-xl flex justify-around items-center px-2 pb-7 pt-2.5 z-50 border-t border-on-surface/8 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          {tabs.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id as Tab)}
              className={cn('flex flex-col items-center gap-1.5 px-3 py-2 rounded-2xl transition-all',
                activeTab === item.id ? 'text-primary bg-primary/8' : 'text-on-surface/40')}>
              <item.icon size={24} />
              <span className="text-[11px] font-bold">{item.label}</span>
            </button>
          ))}
          <button onClick={() => setShowManageProducts(true)}
            className="flex flex-col items-center gap-1.5 px-3 py-2 rounded-2xl transition-all text-on-surface/40">
            <ShoppingCart size={24} />
            <span className="text-[11px] font-bold">สินค้า</span>
          </button>
        </nav>
      </div>
    </>
  );
}

// ── SplashScreen Component ───────────────────────────────────────────────────
function SplashScreen({ groupName }: { groupName: string }) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      className="fixed inset-0 z-[1000] bg-[#fdfefe] flex flex-col items-center justify-center overflow-hidden px-6"
      style={{ backgroundImage: 'url(/splash-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center bottom' }}
    >
      <div className="relative flex flex-col items-center w-full max-w-xl text-center">
        <motion.img src="/splash-logo.webp" alt="SmashPang" draggable={false}
          initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }}
          className="w-48 sm:w-64 h-auto select-none" />

        <motion.img src="/splash-mascot.webp" alt="" draggable={false}
          initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1, y: [0, -8, 0] }}
          transition={{ scale: { duration: 0.7, type: 'spring' }, opacity: { duration: 0.5 }, y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.7 } }}
          className="h-[34vh] max-h-80 w-auto -mt-2 select-none drop-shadow-xl" />

        <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.3 }} className="mt-4 space-y-1.5">
          {groupName && <p className="text-xs font-black text-emerald-600 tracking-widest uppercase">ก๊วน {groupName}</p>}
          <h1 className="font-headline font-black text-3xl sm:text-5xl text-[#0f1f5c] tracking-tight">เตรียมคอร์ทให้พร้อม</h1>
          <p className="text-base sm:text-xl font-semibold text-slate-500">กำลังเชื่อมต่อระบบ รอสักครู่นะ</p>
        </motion.div>

        <div className="mt-8 w-full max-w-[32rem] h-3.5 rounded-full bg-slate-200/80 overflow-hidden relative">
          <motion.div
            initial={{ left: '-40%' }}
            animate={{ left: '100%' }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-0 bottom-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-emerald-400 to-emerald-400"
          />
        </div>

        <p className="mt-5 text-sm sm:text-base font-bold text-[#0f1f5c]">เดี๋ยวก็ได้ลงสนามแล้ว 🏸</p>
        <p className="mt-8 text-xs sm:text-sm font-semibold text-slate-400">SmashPang · เล่นด้วยกัน สนุกกว่า</p>
      </div>
    </motion.div>
  );
}
