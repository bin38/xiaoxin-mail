-- 花火邮箱助手数据库架构 (D1)
-- 此文件定义了在Cloudflare D1数据库中使用的表结构

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT UNIQUE,
  display_name TEXT,
  avatar TEXT,
  created_at TEXT NOT NULL,
  last_login TEXT,
  status INTEGER DEFAULT 1 -- 1=活跃, 0=禁用
);

-- 邮件记录表
CREATE TABLE IF NOT EXISTS mail_records (
  id INTEGER PRIMARY KEY,
  email_id TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  subject TEXT,
  sender TEXT,
  recipient TEXT,
  received_time TEXT,
  content_ref TEXT, -- 指向R2中的内容路径
  has_attachment INTEGER DEFAULT 0,
  folder TEXT DEFAULT 'inbox',
  is_read INTEGER DEFAULT 0,
  is_starred INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 邮件标签表
CREATE TABLE IF NOT EXISTS mail_labels (
  id INTEGER PRIMARY KEY,
  mail_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (mail_id) REFERENCES mail_records(id),
  UNIQUE(mail_id, label)
);

-- 邮件附件索引
CREATE TABLE IF NOT EXISTS mail_attachments (
  id INTEGER PRIMARY KEY,
  mail_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  storage_path TEXT NOT NULL,  -- 指向R2中的附件路径
  created_at TEXT NOT NULL,
  FOREIGN KEY (mail_id) REFERENCES mail_records(id)
);

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_configs (
  id INTEGER PRIMARY KEY,
  config_key TEXT UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 用户配置表
CREATE TABLE IF NOT EXISTS user_configs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  config_key TEXT NOT NULL,
  config_value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, config_key)
);

-- 初始化系统配置
INSERT OR IGNORE INTO system_configs (config_key, config_value, updated_at)
VALUES 
  ('version', '1.0.0', datetime('now')),
  ('last_sync', '', datetime('now')),
  ('max_attachment_size', '10485760', datetime('now'));  -- 10MB

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_mail_records_user_id ON mail_records(user_id);
CREATE INDEX IF NOT EXISTS idx_mail_records_folder ON mail_records(folder);
CREATE INDEX IF NOT EXISTS idx_mail_labels_mail_id ON mail_labels(mail_id);
CREATE INDEX IF NOT EXISTS idx_mail_attachments_mail_id ON mail_attachments(mail_id); 