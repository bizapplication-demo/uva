-- UVA schema — §8 数据模型 (v0.1 草案落地)
-- 所有表服务于模拟系统；坐标为虚构「惠州演示区」演示坐标 (lng/lat 近似值, 非真实设备位置)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orgs (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  region TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','pilot','observer')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  avatar_color TEXT DEFAULT '#3b82f6',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  sn TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','flying','charging','offline','maintenance')),
  battery INTEGER NOT NULL DEFAULT 100,
  lng REAL, lat REAL, alt REAL DEFAULT 0,
  speed REAL DEFAULT 0,
  heading REAL DEFAULT 0,
  firmware TEXT,
  dock_id INTEGER REFERENCES docks(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS docks (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','busy','offline','maintenance')),
  lng REAL NOT NULL, lat REAL NOT NULL,
  has_drone INTEGER NOT NULL DEFAULT 1,
  firmware TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS waylines (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  description TEXT,
  waypoints TEXT NOT NULL, -- JSON: [{lng,lat,alt}]
  distance_m REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS missions (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  wayline_id INTEGER REFERENCES waylines(id),
  device_id INTEGER REFERENCES devices(id),
  dock_id INTEGER REFERENCES docks(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','flying','completed','failed','timeout','cancelled')),
  progress INTEGER NOT NULL DEFAULT 0,
  planned_at TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flights (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  mission_id INTEGER REFERENCES missions(id),
  mission_name TEXT,
  project_name TEXT DEFAULT '惠州演示区巡检项目',
  device_id INTEGER REFERENCES devices(id),
  device_name TEXT,
  dock_id INTEGER REFERENCES docks(id),
  dock_name TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  distance_m REAL DEFAULT 0,
  duration_s INTEGER DEFAULT 0,
  max_alt REAL DEFAULT 0,
  battery_used INTEGER DEFAULT 0,
  shout_duration_s INTEGER DEFAULT 0,
  track TEXT, -- JSON轨迹
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  level TEXT NOT NULL CHECK (level IN ('red','amber','blue')),
  type TEXT NOT NULL,
  target_type TEXT,
  target_name TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  acked_at TEXT,
  acked_by TEXT
);

CREATE TABLE IF NOT EXISTS fences (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('no_fly','mission','area')),
  polygon TEXT NOT NULL, -- JSON: [[lng,lat],...]
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  flight_id INTEGER REFERENCES flights(id),
  kind TEXT NOT NULL DEFAULT 'photo',
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY,
  org_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
