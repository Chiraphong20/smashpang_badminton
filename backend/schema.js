import { pool } from './db.js';

// สร้างตารางทั้งหมดตอน boot — ทุกตารางข้อมูลมี group_id เพื่อแยกข้อมูลแต่ละก๊วนออกจากกัน
export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`groups\` (
      id VARCHAR(40) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      pin_hash VARCHAR(200) NOT NULL,
      pin_length INT NOT NULL DEFAULT 4,
      created_at BIGINT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      group_id VARCHAR(40) NOT NULL,
      id VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      rank_tier VARCHAR(10) NOT NULL,
      is_active BOOLEAN DEFAULT false,
      PRIMARY KEY (group_id, id),
      FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      group_id VARCHAR(40) PRIMARY KEY,
      court_fee_per_person DECIMAL(10, 2) DEFAULT 40,
      shuttle_price DECIMAL(10, 2) DEFAULT 25,
      FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_states (
      group_id VARCHAR(40) NOT NULL,
      state_key VARCHAR(50) NOT NULL,
      state_value LONGTEXT,
      PRIMARY KEY (group_id, state_key),
      FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
    )
  `);

  // version counter ต่อก๊วน — กัน tab/เครื่องเก่า save ทับข้อมูลใหม่แบบเงียบๆ
  await pool.query(`
    CREATE TABLE IF NOT EXISTS state_meta (
      group_id VARCHAR(40) PRIMARY KEY,
      version BIGINT NOT NULL DEFAULT 0,
      FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      group_id VARCHAR(40) NOT NULL,
      id VARCHAR(50) NOT NULL,
      date BIGINT NOT NULL,
      status ENUM('active', 'completed') DEFAULT 'active',
      members_snapshot LONGTEXT NULL,
      PRIMARY KEY (group_id, id),
      INDEX idx_sessions_group_date (group_id, date),
      FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      group_id VARCHAR(40) NOT NULL,
      id VARCHAR(50) NOT NULL,
      session_id VARCHAR(50) NOT NULL,
      court_id VARCHAR(20) NOT NULL,
      court_name VARCHAR(50) NOT NULL,
      played_at BIGINT NOT NULL,
      shuttles_used INT DEFAULT 1,
      shuttle_cost DECIMAL(10,2) DEFAULT 25,
      court_fee DECIMAL(10,2) DEFAULT 40,
      PRIMARY KEY (group_id, id),
      INDEX idx_games_session (group_id, session_id),
      FOREIGN KEY (group_id, session_id) REFERENCES sessions(group_id, id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_players (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(40) NOT NULL,
      game_id VARCHAR(50) NOT NULL,
      member_id VARCHAR(50) NOT NULL,
      member_name VARCHAR(100) NOT NULL,
      member_rank VARCHAR(10) NOT NULL,
      INDEX idx_gp_game (group_id, game_id),
      FOREIGN KEY (group_id, game_id) REFERENCES games(group_id, id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      group_id VARCHAR(40) NOT NULL,
      id VARCHAR(50) NOT NULL,
      session_id VARCHAR(50) NOT NULL,
      member_id VARCHAR(50) NOT NULL,
      member_name VARCHAR(100) NOT NULL,
      member_rank VARCHAR(10) NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      method VARCHAR(50) DEFAULT 'Cash',
      note VARCHAR(255),
      details LONGTEXT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (group_id, id),
      INDEX idx_pay_session (group_id, session_id),
      FOREIGN KEY (group_id, session_id) REFERENCES sessions(group_id, id) ON DELETE CASCADE
    )
  `);

  // ── บัญชีเจ้าของก๊วน / แอดมินระบบ ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(40) PRIMARY KEY,
      email VARCHAR(190) NULL UNIQUE,
      password_hash VARCHAR(200) NULL,
      line_id VARCHAR(64) NULL UNIQUE,
      display_name VARCHAR(100) NOT NULL,
      role ENUM('owner', 'admin') NOT NULL DEFAULT 'owner',
      status ENUM('pending', 'active', 'suspended') NOT NULL DEFAULT 'pending',
      created_at BIGINT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS verifications (
      token_hash VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(40) NOT NULL,
      expires_at BIGINT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ประกาศหาสมาชิก (หน้า "หาก๊วน")
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_listings (
      group_id VARCHAR(40) PRIMARY KEY,
      listed BOOLEAN NOT NULL DEFAULT false,
      description VARCHAR(500) NULL,
      venue VARCHAR(150) NULL,
      area VARCHAR(80) NULL,
      map_url VARCHAR(300) NULL,
      schedule TEXT NULL,
      levels TEXT NULL,
      price VARCHAR(100) NULL,
      contact VARCHAR(200) NULL,
      updated_at BIGINT NOT NULL DEFAULT 0,
      INDEX idx_listings_listed (listed, updated_at),
      FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
    )
  `);

  // คอลัมน์ใหม่ของ groups (ก๊วนที่สร้างไว้ก่อนหน้านี้ owner_id = NULL, mode = perGame)
  const addColumn = async (table, column, ddl) => {
    const [rows] = await pool.query(
      'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
      [table, column]
    );
    if (rows.length === 0) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  };
  await addColumn('users', 'username', 'username VARCHAR(30) NULL UNIQUE');
  await addColumn('groups', 'owner_id', 'owner_id VARCHAR(40) NULL');
  await addColumn('groups', 'status', "status ENUM('active', 'suspended') NOT NULL DEFAULT 'active'");
}
