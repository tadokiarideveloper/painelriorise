CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  nickname TEXT NOT NULL,
  server TEXT NOT NULL DEFAULT '39',
  role_level INTEGER NOT NULL DEFAULT 1,
  blocked INTEGER NOT NULL DEFAULT 0,
  is_super INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role_level ON users(role_level);
CREATE INDEX IF NOT EXISTS idx_users_blocked ON users(blocked);

CREATE TABLE IF NOT EXISTS punishments (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  player_name TEXT NOT NULL,
  punishment_time TEXT NOT NULL,
  reason TEXT NOT NULL,
  observation TEXT,
  article TEXT NOT NULL,
  server TEXT NOT NULL DEFAULT '39',
  occurred_date TEXT NOT NULL,
  evidence_url TEXT,
  created_by TEXT NOT NULL DEFAULT 'Admin Kiari',
  created_by_username TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_punishments_player_name ON punishments(player_name);
CREATE INDEX IF NOT EXISTS idx_punishments_type ON punishments(type);
CREATE INDEX IF NOT EXISTS idx_punishments_created_by_username ON punishments(created_by_username);
CREATE INDEX IF NOT EXISTS idx_punishments_created_at ON punishments(created_at);
CREATE INDEX IF NOT EXISTS idx_punishments_occurred_date ON punishments(occurred_date);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('monthlyGoal', '30', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
