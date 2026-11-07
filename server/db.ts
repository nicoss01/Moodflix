import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve(process.env.MOODFLIX_DATA || './data')
fs.mkdirSync(dataDir, { recursive: true })

export const db: Database.Database = new Database(path.join(dataDir, 'moodflix.db'))
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT 'bot',
    color TEXT NOT NULL DEFAULT '#f21d45',
    max_age INTEGER NOT NULL DEFAULT 18,
    is_admin INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE,
    title TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('movie','series')),
    series_title TEXT,
    season INTEGER,
    episode INTEGER,
    year INTEGER,
    duration INTEGER NOT NULL DEFAULT 0,
    age_rating INTEGER NOT NULL DEFAULT 0,
    genres TEXT NOT NULL DEFAULT '[]',
    overview TEXT NOT NULL DEFAULT '',
    poster TEXT,
    backdrop TEXT,
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    available INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS ratings (
    profile_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL,
    score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
    PRIMARY KEY(profile_id, media_id)
  );
  CREATE TABLE IF NOT EXISTS profile_genre_preferences (
    profile_id INTEGER NOT NULL,
    genre TEXT NOT NULL,
    PRIMARY KEY(profile_id, genre)
  );
  CREATE TABLE IF NOT EXISTS metadata_cache (
    cache_key TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    payload TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS progress (
    profile_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL,
    position REAL NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(profile_id, media_id)
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

const count = db.prepare('SELECT count(*) AS n FROM profiles').get() as { n: number }
if (!count.n) {
  const insert = db.prepare('INSERT INTO profiles(name, avatar, color, max_age, is_admin) VALUES (?, ?, ?, ?, ?)')
  insert.run('Nicolas', 'pilot', '#f21d45', 18, 1)
  insert.run('Émilie', 'dreamer', '#8b5cf6', 16, 0)
  insert.run('Léo', 'arcade', '#84f151', 12, 0)
  insert.run('Chloé', 'fox', '#ff6c72', 8, 0)
}

// Supprime les anciennes cartes de démonstration sans toucher aux fichiers réellement indexés.
db.prepare("DELETE FROM media WHERE path IS NULL AND poster LIKE 'gradient:%'").run()
db.prepare('DELETE FROM ratings WHERE media_id NOT IN (SELECT id FROM media)').run()
db.prepare('DELETE FROM progress WHERE media_id NOT IN (SELECT id FROM media)').run()
db.prepare(`UPDATE progress SET completed=1
  WHERE completed=0 AND EXISTS (
    SELECT 1 FROM media WHERE media.id=progress.media_id AND media.duration>0 AND progress.position>=media.duration*0.95
  )`).run()
db.prepare('UPDATE profiles SET name=substr(name,1,12) WHERE length(name)>12').run()

export function getSetting(key: string, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? process.env[key] ?? fallback
}

export function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value)
}
