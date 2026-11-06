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

const mediaCount = db.prepare('SELECT count(*) AS n FROM media').get() as { n: number }
if (!mediaCount.n) {
  const insert = db.prepare(`INSERT INTO media
    (path,title,kind,series_title,season,episode,year,duration,age_rating,genres,overview,poster,backdrop)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  const demos = [
    [null,'Dune : Deuxième Partie','movie',null,null,null,2024,9960,12,'["Aventure","Science-fiction"]','Paul Atréides s’unit aux Fremen pour mener la révolte contre ceux qui ont détruit sa famille. Une épopée spectaculaire.','gradient:sand','gradient:dune'],
    [null,'Interstellar','movie',null,null,null,2014,10147,10,'["Science-fiction","Drame"]','Un groupe d’explorateurs utilise une faille dans l’espace-temps pour repousser les limites du voyage humain.','gradient:space','gradient:interstellar'],
    [null,'Le Dernier Royaume','series','Le Dernier Royaume',1,1,2025,3120,12,'["Drame","Aventure"]','Une héritière découvre un royaume oublié et le secret qui lie sa famille à son destin.','gradient:forest','gradient:forest'],
    [null,'Les Chroniques du Nord','series','Les Chroniques du Nord',1,2,2025,2880,10,'["Fantastique","Aventure"]','La troupe poursuit sa route au-delà des montagnes interdites.','gradient:ice','gradient:ice'],
    [null,'Cosmos 9','series','Cosmos 9',2,4,2026,2700,7,'["Science-fiction","Famille"]','L’équipage reçoit un signal venu d’une lune que toutes les cartes disent inhabitée.','gradient:violet','gradient:violet']
  ]
  for (const item of demos) insert.run(...item)
}

export function getSetting(key: string, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? process.env[key] ?? fallback
}

export function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value)
}
