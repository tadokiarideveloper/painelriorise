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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_punishments_player_name ON punishments(player_name);
CREATE INDEX IF NOT EXISTS idx_punishments_type ON punishments(type);
CREATE INDEX IF NOT EXISTS idx_punishments_created_at ON punishments(created_at);
CREATE INDEX IF NOT EXISTS idx_punishments_occurred_date ON punishments(occurred_date);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
