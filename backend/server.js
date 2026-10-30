import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { ensureSchema } from './schema.js';
import { hashPin, verifyPin, issueToken, requireGroupAuth, loginThrottle, recordLoginResult } from './auth.js';
import { auth, me, admin, publicConfig } from './users.js';
import { listings, mountGroupListing } from './listings.js';
import { ensurePlans, gateState, mountGroupPlan, effectivePlan } from './plans.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// CORS_ORIGIN: รายการ origin คั่นด้วย , (ไม่ตั้ง = อนุญาตทุก origin เหมาะกับ dev เท่านั้น)
const corsOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors(corsOrigins.length ? { origin: corsOrigins } : undefined));
app.use(express.json({ limit: '50mb' }));
app.set('trust proxy', 1);

// Serve static assets from the frontend build
app.use(express.static(path.join(__dirname, '../dist')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ───────────────────────── Accounts / Groups ─────────────────────────
// การสร้างก๊วนต้องทำผ่านบัญชีเจ้าของก๊วนที่ยืนยันตัวตนแล้ว (POST /api/me/groups)
app.get('/api/config', (req, res) => {
  res.json(publicConfig());
});

app.use('/api/auth', auth);
app.use('/api/me', me);
app.use('/api/admin', admin);
app.use('/api/listings', listings);

// ───────────────────────── Per-group routes: /api/g/:gid/... ─────────────────────────
const pub = express.Router({ mergeParams: true });

// ข้อมูลสาธารณะของก๊วน (ใช้แสดงหน้า login) — ไม่เปิดเผยข้อมูลอื่นนอกจากชื่อและความยาว PIN
pub.get('/info', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT g.id, g.name, g.pin_length, g.status, l.schedule FROM `groups` g LEFT JOIN group_listings l ON l.group_id = g.id WHERE g.id = ?',
      [req.params.gid]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'group_not_found' });
    let schedule = [];
    try { schedule = JSON.parse(rows[0].schedule || '[]'); } catch { /* ignore corrupt value */ }
    res.json({ id: rows[0].id, name: rows[0].name, pinLength: rows[0].pin_length, suspended: rows[0].status === 'suspended', schedule });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

pub.post('/login', loginThrottle, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT pin_hash, status FROM `groups` WHERE id = ?', [req.params.gid]);
    if (rows.length === 0) return res.status(404).json({ error: 'group_not_found' });
    if (rows[0].status === 'suspended') return res.status(403).json({ error: 'group_suspended' });
    const ok = verifyPin(String(req.body?.pin ?? ''), rows[0].pin_hash);
    recordLoginResult(req.throttleKey, ok);
    if (!ok) return res.status(401).json({ error: 'wrong_pin' });
    res.json({ token: issueToken(req.params.gid) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

// หน้าจอคิว (Queue View) เปิดดูได้โดยไม่ต้อง login — ส่งเฉพาะสิ่งที่จอคิวใช้แสดง
pub.get('/queue', async (req, res) => {
  const gid = req.params.gid;
  try {
    const [groupRows] = await pool.query('SELECT name, owner_id FROM `groups` WHERE id = ?', [gid]);
    if (groupRows.length === 0) return res.status(404).json({ error: 'group_not_found' });
    if (!(await effectivePlan(groupRows[0].owner_id)).plan.features.queueScreen) {
      return res.status(403).json({ error: 'plan_limit', message: 'แพ็กเกจของก๊วนนี้ไม่รองรับหน้าคิวสาธารณะ' });
    }
    const [states] = await pool.query(
      "SELECT state_key, state_value FROM system_states WHERE group_id = ? AND state_key IN ('members', 'courts', 'courtQueues')",
      [gid]
    );
    const result = { groupName: groupRows[0].name };
    states.forEach(row => {
      try { result[row.state_key] = JSON.parse(row.state_value); } catch { /* ignore corrupt value */ }
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

app.use('/api/g/:gid', pub);

const r = express.Router({ mergeParams: true });
r.use(requireGroupAuth);
// ก๊วนที่ถูกระงับ: token ที่ออกไปแล้วก็ใช้ไม่ได้ทันที
r.use(async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT status FROM `groups` WHERE id = ?', [req.params.gid]);
    if (rows[0]?.status === 'suspended') return res.status(403).json({ error: 'group_suspended' });
    next();
  } catch (err) {
    next(err);
  }
});
app.use('/api/g/:gid', r);

r.post('/pin', async (req, res) => {
  const { pin } = req.body || {};
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) return res.status(400).json({ error: 'invalid_pin' });
  try {
    await pool.query('UPDATE `groups` SET pin_hash = ?, pin_length = ? WHERE id = ?', [hashPin(pin), pin.length, req.params.gid]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

// PULL MASTER DATA
r.get('/master', async (req, res) => {
  const gid = req.params.gid;
  try {
    const [membersRows] = await pool.query('SELECT * FROM members WHERE group_id = ?', [gid]);
    const [settingsRows] = await pool.query('SELECT * FROM settings WHERE group_id = ?', [gid]);

    // Format for React App
    const rankMemory = {};
    const membersList = membersRows.map(r => {
      rankMemory[r.name] = r.rank_tier;
      return {
        id: r.id,
        name: r.name,
        rank: r.rank_tier,
        gamesPlayed: 0,
        status: r.is_active ? 'waiting' : 'resting',
        checkInTime: Date.now(),
        balance: 0, courtBalance: 0, shuttleBalance: 0, snackBalance: 0, shuttleCount: 0, snackHistory: [], paidCourtFee: false
      };
    });

    res.json({
      members: membersList,
      rankMemory,
      settings: settingsRows.length > 0 ? {
        courtFeePerPerson: Number(settingsRows[0].court_fee_per_person),
        shuttlePrice: Number(settingsRows[0].shuttle_price)
      } : {}
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUSH MASTER DATA
r.post('/master', async (req, res) => {
  const gid = req.params.gid;
  const { members, settings } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Update settings
    if (settings) {
      await conn.query(
        'UPDATE settings SET court_fee_per_person = ?, shuttle_price = ? WHERE group_id = ?',
        [settings.courtFeePerPerson, settings.shuttlePrice, gid]
      );
    }

    // Update members
    if (members && members.length > 0) {
      for (const m of members) {
        await conn.query(
          'INSERT INTO members (group_id, id, name, rank_tier, is_active) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), rank_tier = VALUES(rank_tier), is_active = VALUES(is_active)',
          [gid, m.id, m.name, m.rank, m.status !== 'resting']
        );
      }
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUSH SESSION DATA (End of Day Sync)
r.post('/sync', async (req, res) => {
  const gid = req.params.gid;
  const { timestamp, members, games, payments } = req.body;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const sessionId = `session-${timestamp}`;
    const dateInt = new Date(timestamp).getTime();
    const membersSnapshot = JSON.stringify(members);

    // Insert Session
    await conn.query('INSERT INTO sessions (group_id, id, date, status, members_snapshot) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE members_snapshot = VALUES(members_snapshot)', [gid, sessionId, dateInt, 'completed', membersSnapshot]);

    // Insert Games
    for (const g of (games || [])) {
      const gId = g.id || `game-${Date.now()}-${Math.random()}`;
      await conn.query(
        'INSERT IGNORE INTO games (group_id, id, session_id, court_id, court_name, played_at, shuttles_used, shuttle_cost, court_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [gid, gId, sessionId, g.courtId, g.courtName, g.playedAt, g.shuttlesUsed, g.shuttleCostPerPerson, g.courtFeePerPerson]
      );

      // Delete old players for this game first (safe re-insert)
      await conn.query('DELETE FROM game_players WHERE group_id = ? AND game_id = ?', [gid, gId]);
      for (const p of (g.players || [])) {
        await conn.query(
          'INSERT INTO game_players (group_id, game_id, member_id, member_name, member_rank) VALUES (?, ?, ?, ?, ?)',
          [gid, gId, p.id, p.name, p.rank]
        );
      }
    }

    // Insert Payments
    for (const p of (payments || [])) {
      const pId = p.id || `payment-${Date.now()}-${Math.random()}`;
      const detailsStr = p.details ? JSON.stringify(p.details) : null;
      await conn.query(
        'INSERT IGNORE INTO payments (group_id, id, session_id, member_id, member_name, member_rank, amount, method, note, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [gid, pId, sessionId, p.memberId, p.memberName, p.memberRank, p.amount, p.method, p.note || '', detailsStr, p.timestamp]
      );
    }

    await conn.commit();
    res.json({ success: true, sessionId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET ALL SESSION DATES
r.get('/sessions', async (req, res) => {
  const gid = req.params.gid;
  try {
    const [sessions] = await pool.query('SELECT id, date FROM sessions WHERE group_id = ? ORDER BY date DESC', [gid]);
    res.json(sessions.map(s => ({ id: s.id, date: Number(s.date) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET MEMBER PLAY HISTORY (supports multi-name: "เน็ต,เน็ตน่ารัก")
r.get('/member-history', async (req, res) => {
  const gid = req.params.gid;
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'Missing name' });

  // แยกชื่อหลายชื่อด้วย , / ; / |
  const names = name.split(/[,;|]/).map(n => n.trim()).filter(Boolean);

  try {
    const dateMap = new Map();
    const dayKey = (ts) => { const d = new Date(Number(ts)); d.setHours(0,0,0,0); return d.getTime(); };

    const [settingsRows] = await pool.query('SELECT court_fee_per_person, shuttle_price FROM settings WHERE group_id = ?', [gid]);
    const courtFee = Number(settingsRows[0]?.court_fee_per_person || 40);
    const shuttlePrice = Number(settingsRows[0]?.shuttle_price || 25);

    const likeNames = names.map(n => `%${n}%`);
    const whereName = likeNames.map(() => 'gp.member_name LIKE ?').join(' OR ');
    const whereSnap = likeNames.map(() => 'members_snapshot LIKE ?').join(' OR ');
    const wherePay  = likeNames.map(() => 'p.member_name LIKE ?').join(' OR ');

    // Source 1: game_players
    const [gameRows] = await pool.query(`
      SELECT s.id as session_id, s.date,
             COUNT(DISTINCT gp.game_id) as games_played,
             SUM(g.shuttle_cost) as shuttle_total
      FROM sessions s
      JOIN games g ON g.group_id = s.group_id AND g.session_id = s.id
      JOIN game_players gp ON gp.group_id = g.group_id AND gp.game_id = g.id
      WHERE s.group_id = ? AND (${whereName})
      GROUP BY s.id, s.date
    `, [gid, ...likeNames]);

    gameRows.forEach(r => {
      const key = dayKey(r.date);
      const entry = dateMap.get(key) || { date: Number(r.date), gamesPlayed: 0, cost: 0, paid: 0 };
      entry.gamesPlayed += Number(r.games_played);
      entry.cost += (Number(r.shuttle_total) || 0) + courtFee;
      dateMap.set(key, entry);
    });

    // Source 2: members_snapshot
    const [snapRows] = await pool.query(
      `SELECT date, members_snapshot FROM sessions WHERE group_id = ? AND (${whereSnap})`, [gid, ...likeNames]
    );

    snapRows.forEach(r => {
      try {
        const snapshot = JSON.parse(r.members_snapshot);
        // หาสมาชิกที่ตรงกับชื่อใดชื่อหนึ่ง
        const member = snapshot.find(m => m.name && names.some(n => m.name.toLowerCase().includes(n.toLowerCase())));
        if (!member) return;

        const games = member.gamesPlayed || 0;
        const court = member.courtBalance || 0;
        const shuttle = member.shuttleBalance || 0;
        const snack = member.snackBalance || 0;
        const key = dayKey(r.date);

        // ข้ามถ้าไม่มีข้อมูลเลย
        if (games === 0 && court === 0 && shuttle === 0 && snack === 0) return;

        if (!dateMap.has(key)) {
          let cost = court + shuttle + snack;
          // balance=0 แต่เล่นไปแล้ว = จ่ายแล้ว ประมาณค่าจาก settings
          if (cost === 0 && games > 0) cost = courtFee + (games * shuttlePrice);
          const paid = (cost > 0 && court === 0 && shuttle === 0) ? cost : 0;
          dateMap.set(key, { date: Number(r.date), gamesPlayed: games, cost, paid });
        } else {
          const entry = dateMap.get(key);
          if (snack > 0) entry.cost += snack;
        }
      } catch (e) {}
    });

    // แก้ไข entry ที่ cost=0 แต่มี gamesPlayed (ก่อนถึง snapshot loop)
    dateMap.forEach((entry) => {
      if (entry.cost === 0 && entry.gamesPlayed > 0) {
        entry.cost = courtFee + (entry.gamesPlayed * shuttlePrice);
        entry.paid = entry.cost;
      }
    });

    // Source 3: payments
    const [payRows] = await pool.query(`
      SELECT p.session_id, s.date, p.amount, p.details
      FROM payments p JOIN sessions s ON s.group_id = p.group_id AND s.id = p.session_id
      WHERE p.group_id = ? AND (${wherePay}) ORDER BY s.date DESC
    `, [gid, ...likeNames]);

    const payDayMap = new Map();
    payRows.forEach(r => {
      const key = dayKey(r.date);
      if (!payDayMap.has(key)) payDayMap.set(key, { date: Number(r.date), paid: 0, court: 0, shuttle: 0, snack: 0 });
      const e = payDayMap.get(key);
      e.paid += Number(r.amount);
      try {
        const det = JSON.parse(r.details);
        e.court   += det.courtBalance || 0;
        e.shuttle += det.shuttleBalance || 0;
        e.snack   += (det.snackHistory || []).reduce((a, s) => a + (s.price || 0), 0);
      } catch {}
    });

    payDayMap.forEach((pay, key) => {
      if (dateMap.has(key)) {
        const entry = dateMap.get(key);
        entry.paid = pay.paid;
        const payTotal = pay.court + pay.shuttle + pay.snack;
        if (payTotal > 0) entry.cost = payTotal;
      } else {
        const payTotal = pay.court + pay.shuttle + pay.snack;
        if (payTotal > 0 || pay.paid > 0) {
          dateMap.set(key, { date: pay.date, gamesPlayed: 0, cost: payTotal || pay.paid, paid: pay.paid });
        }
      }
    });

    res.json(Array.from(dateMap.values()).sort((a, b) => b.date - a.date));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PULL SESSION (Historical data)
r.get('/session', async (req, res) => {
  const gid = req.params.gid;
  const { date } = req.query; // YYYY-MM-DD
  if (!date) return res.status(400).json({ error: 'Missing date parameter' });

  try {
    // Robust date parsing (YYYY-MM-DD or timestamp)
    let dateInt = Number(date);
    if (isNaN(dateInt)) dateInt = new Date(date).getTime();
    if (isNaN(dateInt)) return res.status(400).json({ error: 'Invalid date format' });

    const startOfDay = new Date(dateInt);
    startOfDay.setHours(0, 0, 0, 0);
    // Extend window to 36 hours (covering the full day + up to 12 PM next day)
    // to catch sessions that started late and were saved the next morning.
    const endWindow = new Date(startOfDay.getTime() + 36 * 60 * 60 * 1000);

    const [sessions] = await pool.query(
      'SELECT * FROM sessions WHERE group_id = ? AND date >= ? AND date <= ? ORDER BY date DESC LIMIT 1', 
      [gid, startOfDay.getTime(), endWindow.getTime()]
    );

    if (sessions.length === 0) {
      return res.json({ date: startOfDay.getTime(), membersSnapshot: [], gameHistory: [], paymentHistory: [] });
    }

    const sessionId = sessions[0].id;
    const sessionDate = Number(sessions[0].date);
    const storedSnapshotJson = sessions[0].members_snapshot;

    // GET SETTINGS for default court fee and shuttle price (used in reconstruction)
    const [settings] = await pool.query('SELECT court_fee_per_person, shuttle_price FROM settings WHERE group_id = ?', [gid]);
    const defaultCourtFee = Number(settings[0]?.court_fee_per_person || 40);
    const defaultShuttlePrice = Number(settings[0]?.shuttle_price || 25);

    // Get games
    const [games] = await pool.query('SELECT * FROM games WHERE group_id = ? AND session_id = ? ORDER BY played_at DESC', [gid, sessionId]);
    const [players] = await pool.query('SELECT p.* FROM game_players p JOIN games g ON p.group_id = g.group_id AND p.game_id = g.id WHERE g.group_id = ? AND g.session_id = ?', [gid, sessionId]);

    const formattedGames = games.map(g => {
      const gPlayers = players.filter(p => p.game_id === g.id).map(p => ({
        id: p.member_id, name: p.member_name, rank: p.member_rank
      }));
      
      const shuttleCostPerPerson = Number(g.shuttle_cost);
      let shuttlesUsed = g.shuttles_used;
      
      // RECONSTRUCT SHUTTLES USED: If the cost per person implies more shuttles 
      // than recorded (common in legacy data), adjust shuttlesUsed for accurate summary.
      // Calculation: (CostPerPerson * NumPlayers) / PricePerShuttle
      const totalCostForGame = shuttleCostPerPerson * gPlayers.length;
      const impliedShuttles = Math.round(totalCostForGame / defaultShuttlePrice);
      if (impliedShuttles > shuttlesUsed) {
        shuttlesUsed = impliedShuttles;
      }

      return {
        id: g.id,
        courtId: g.court_id,
        courtName: g.court_name,
        playedAt: Number(g.played_at),
        shuttlesUsed: shuttlesUsed,
        shuttleCostPerPerson: shuttleCostPerPerson,
        courtFeePerPerson: Number(g.court_fee),
        players: gPlayers
      };
    });

    // Get payments
    const [payments] = await pool.query('SELECT * FROM payments WHERE group_id = ? AND session_id = ? ORDER BY created_at DESC', [gid, sessionId]);
    const formattedPayments = payments.map(p => {
      let parsedDetails = undefined;
      if (p.details) {
        try { parsedDetails = JSON.parse(p.details); } catch (e) { }
      }
      return {
        id: p.id,
        memberId: p.member_id,
        memberName: p.member_name,
        memberRank: p.member_rank,
        amount: Number(p.amount),
        method: p.method,
        note: p.note,
        details: parsedDetails,
        timestamp: Number(p.created_at)
      };
    });

    // Try to use stored snapshot first for 100% data fidelity
    let snapshot = null;
    if (storedSnapshotJson) {
      try { 
        snapshot = JSON.parse(storedSnapshotJson); 
      } catch (e) {
        console.error('Error parsing stored members_snapshot:', e);
      }
    }

    // Reconstruct simplified members snapshot from games & payments for historical view (Fallback)
    if (!snapshot || snapshot.length === 0) {
      const membersMap = new Map();
      
      // Process Games for individual costs
      formattedGames.forEach(g => {
        g.players.forEach(p => {
          if (!membersMap.has(p.id)) {
            membersMap.set(p.id, { 
              id: p.id, name: p.name, rank: p.rank, gamesPlayed: 0, status: 'paid', 
              balance: 0, courtBalance: 0, shuttleBalance: 0, snackBalance: 0, 
              shuttleCount: 0, snackHistory: [], paidCourtFee: true, checkInTime: 0 
            });
          }
          const m = membersMap.get(p.id);
          m.gamesPlayed += 1;
          const gameFee = Number(g.courtFeePerPerson);
          m.courtBalance += gameFee;
          const sCost = Number(g.shuttleCostPerPerson);
          m.shuttleBalance += sCost;
          // Reconstruct shuttle quantity: based on the cost they paid / price per shuttle
          // If each shuttle is ฿25 and they paid ฿25, they used 1 shuttle effectively.
          m.shuttleCount += (sCost / defaultShuttlePrice);
        });
      });

      // 1. BACKFILL: If courtBalance is still 0 (e.g. because game.court_fee was 0), 
      // but they played games, apply a ONE-TIME default court fee.
      membersMap.forEach(m => {
        if ((m.courtBalance || 0) === 0 && m.gamesPlayed > 0) {
          m.courtBalance = defaultCourtFee;
        }
        // Round shuttle count for neatness
        m.shuttleCount = Math.round(m.shuttleCount * 10) / 10;
      });
      
      // Process Payments for snack history and actual amount paid
      const memberPaidTotal = new Map(); // Track how much they actually paid
      formattedPayments.forEach(p => {
        // 1. Add snack costs from payment details if they exists
        if (p.details && p.details.snackHistory) {
          p.details.snackHistory.forEach(s => {
            if (!membersMap.has(p.memberId)) { // Create member if only payment exists
              membersMap.set(p.memberId, { id: p.memberId, name: p.memberName, rank: p.memberRank, gamesPlayed: 0, status: 'paid', balance: 0, courtBalance: 0, shuttleBalance: 0, snackBalance: 0, shuttleCount: 0, snackHistory: [], paidCourtFee: true, checkInTime: 0 });
            }
            const m = membersMap.get(p.memberId);
            m.snackHistory.push(s);
            m.snackBalance += Number(s.price);
          });
        }

        // 2. Map included members (if any) to have their debt cleared in balance calc
        const includedIds = p.details?.includedMemberIds || [p.memberId];
        includedIds.forEach(id => {
          const currentPaid = memberPaidTotal.get(id) || 0;
          memberPaidTotal.set(id, currentPaid + (p.amount / includedIds.length)); 
        });
      });

      // Final balance calculation and status (incorporate payments & snacks)
      membersMap.forEach((m, id) => {
        const totalPaid = memberPaidTotal.get(id) || 0;
        // Total costs identified FROM GAMES
        const gameCosts = (m.courtBalance || 0) + (m.shuttleBalance || 0);
        
        // RECONSTRUCT SNACKS: If they paid more than their court+shuttle cost, 
        // and we have NO snack history, attribute the difference to snackBalance.
        // This handles cases where older sync data lost the snack detail objects.
        if (totalPaid > (gameCosts + (m.snackBalance || 0))) {
          const diff = totalPaid - (gameCosts + (m.snackBalance || 0));
          m.snackBalance = (m.snackBalance || 0) + diff;
          m.snackHistory.push({ 
            id: `re-snack-${Date.now()}-${id}`, 
            name: 'สินค้า/น้ำ (กู้คืนจากยอดจ่าย)', 
            price: diff, 
            time: sessionDate 
          });
        }

        const totalIncurred = gameCosts + (m.snackBalance || 0);
        m.balance = Math.max(0, totalIncurred - totalPaid);
        m.status = m.balance > 0 ? 'resting' : 'paid'; 

        // Add total fields for Dashboard consistency
        m.totalCourt = m.courtBalance;
        m.totalShuttle = m.shuttleBalance;
        m.totalSnack = m.snackBalance;
      });

      snapshot = Array.from(membersMap.values());
    }

    res.json({
      id: sessionId,
      date: sessionDate,
      membersSnapshot: snapshot,
      gameHistory: formattedGames,
      paymentHistory: formattedPayments
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET FULL LIVE STATE (Replaces initial localStorage read)
r.get('/state', async (req, res) => {
  const gid = req.params.gid;
  try {
    const [states] = await pool.query('SELECT * FROM system_states WHERE group_id = ?', [gid]);
    const [meta] = await pool.query('SELECT version FROM state_meta WHERE group_id = ?', [gid]);
    const result = {};
    states.forEach(row => {
      try {
        result[row.state_key] = JSON.parse(row.state_value);
      } catch (e) {
        result[row.state_key] = row.state_value;
      }
    });
    // เวอร์ชันปัจจุบันของข้อมูลใน DB — client เก็บค่านี้ไว้เทียบตอน save
    result._version = meta[0]?.version ?? 0;
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// SAVE FULL LIVE STATE (Replaces localStorage.setItem)
// ใช้ optimistic concurrency: client ต้องแนบ _version ที่โหลดมาล่าสุดมาด้วย
// ถ้าเลขไม่ตรงกับ DB (แปลว่ามีเครื่องอื่น save ทับไปแล้วหลังจากนั้น) จะปฏิเสธ
// การ save นี้ทันที (409) แทนที่จะปล่อยให้ข้อมูลเก่าทับข้อมูลใหม่แบบเงียบๆ
r.post('/state', async (req, res) => {
  const gid = req.params.gid;
  const { _version, ...stateObj } = req.body;
  try {
    const blocked = await gateState(gid, stateObj);
    if (blocked) return res.status(403).json({ error: 'plan_limit', ...blocked });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server_error' });
  }
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [metaRows] = await conn.query('SELECT version FROM state_meta WHERE group_id = ? FOR UPDATE', [gid]);
    const currentVersion = metaRows[0]?.version ?? 0;

    // สำคัญ: ถ้า client ไม่ส่ง _version มาเลย (เช่นแท็บเก่าที่รันโค้ด frontend
    // รุ่นก่อนมี version-check ค้างอยู่หลายวัน) ห้ามข้าม check ไปเฉยๆ — ให้ถือว่า
    // เป็น client ที่เก่าที่สุดเท่าที่จะเป็นไปได้ (-1) ซึ่งจะไม่ตรงกับ currentVersion
    // เกือบทุกกรณีแน่ๆ แล้วโดนปฏิเสธไป ไม่ใช่ปล่อยผ่านให้ทับข้อมูลแบบเงียบๆ เหมือนเดิม
    const clientVersion = typeof _version === 'number' ? _version : -1;

    if (clientVersion !== currentVersion) {
      await conn.rollback();
      return res.status(409).json({
        error: 'stale_write',
        message: 'มีการบันทึกข้อมูลจากเครื่อง/แท็บอื่นไปแล้วหลังจากที่เครื่องนี้โหลดข้อมูลล่าสุด',
        currentVersion
      });
    }

    for (const [key, value] of Object.entries(stateObj)) {
      await conn.query(
        'INSERT INTO system_states (group_id, state_key, state_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE state_value = VALUES(state_value)',
        [gid, key, JSON.stringify(value)]
      );
    }

    const newVersion = currentVersion + 1;
    await conn.query('UPDATE state_meta SET version = ? WHERE group_id = ?', [newVersion, gid]);

    await conn.commit();
    res.json({ success: true, version: newVersion });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ตั้ง/เปลี่ยนชื่อก๊วน (ตั้งครั้งแรกตอนเข้าก๊วนที่เพิ่งสร้าง)
mountGroupListing(r);
mountGroupPlan(r);

r.put('/name', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 100) return res.status(400).json({ error: 'invalid_name' });
  try {
    await pool.query('UPDATE `groups` SET name = ? WHERE id = ?', [name, req.params.gid]);
    res.json({ name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

// RE-SYNC: Recover all session data from system_states blob into proper tables
r.post('/resync', async (req, res) => {
  const gid = req.params.gid;
  const conn = await pool.getConnection();
  try {
    const [rows] = await pool.query("SELECT state_value FROM system_states WHERE group_id = ? AND state_key = 'sessionHistory'", [gid]);
    if (rows.length === 0) return res.status(404).json({ error: 'No sessionHistory found in system_states' });

    const sessionHistory = JSON.parse(rows[0].state_value);
    let synced = 0;

    await conn.beginTransaction();
    for (const session of sessionHistory) {
      const sessionId = session.id || `session-${session.date}`;
      const dateInt = Number(session.date);
      const membersSnapshot = session.membersSnapshot ? JSON.stringify(session.membersSnapshot) : null;

      await conn.query(
        'INSERT INTO sessions (group_id, id, date, status, members_snapshot) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), members_snapshot = VALUES(members_snapshot)', 
        [gid, sessionId, dateInt, 'completed', membersSnapshot]
      );

      for (const g of (session.gameHistory || [])) {
        const gId = g.id || `game-${g.playedAt}`;
        await conn.query(
          'INSERT IGNORE INTO games (group_id, id, session_id, court_id, court_name, played_at, shuttles_used, shuttle_cost, court_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [gid, gId, sessionId, g.courtId, g.courtName, g.playedAt, g.shuttlesUsed, g.shuttleCostPerPerson, g.courtFeePerPerson]
        );
        await conn.query('DELETE FROM game_players WHERE group_id = ? AND game_id = ?', [gid, gId]);
        for (const p of (g.players || [])) {
          await conn.query(
            'INSERT INTO game_players (group_id, game_id, member_id, member_name, member_rank) VALUES (?, ?, ?, ?, ?)',
            [gid, gId, p.id, p.name, p.rank]
          );
        }
      }

      for (const p of (session.paymentHistory || [])) {
        const pId = p.id || `pay-${p.timestamp}`;
        const detailsStr = p.details ? JSON.stringify(p.details) : null;
        await conn.query(
          'INSERT IGNORE INTO payments (group_id, id, session_id, member_id, member_name, member_rank, amount, method, note, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [gid, pId, sessionId, p.memberId, p.memberName, p.memberRank, p.amount, p.method, p.note || '', detailsStr, p.timestamp]
        );
      }
      synced++;
    }

    await conn.commit();
    res.json({ success: true, sessionsSynced: synced });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// Unknown API routes → JSON 404 (อย่าให้ตกไปเป็น index.html)
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// Fallback for SPA routing: serve index.html for all other requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

ensureSchema()
  .then(() => ensurePlans())
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 SmashPang Multi-Group Server running on port ${port}`);
    });
  })
  .catch(err => {
    console.error('❌ สร้างตารางไม่สำเร็จ:', err.message);
    process.exit(1);
  });
