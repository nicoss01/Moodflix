import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { db, getSetting } from './db.js'

const execFileAsync = promisify(execFile)
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.webm', '.ts'])

function walk(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full)
  }
  return files
}

export function parseMediaName(file: string) {
  const base = path.basename(file, path.extname(file)).replace(/[._]/g, ' ')
  const episode = base.match(/(.+?)[ .-]+S(\d{1,2})E(\d{1,2})/i)
  const year = base.match(/\b(19\d{2}|20\d{2})\b/)
  if (episode) return { title: `${episode[1].trim()} — S${episode[2]} E${episode[3]}`, kind: 'series' as const, seriesTitle: episode[1].trim(), season: +episode[2], episode: +episode[3], year: year ? +year[1] : null }
  return { title: base.replace(/\b(19\d{2}|20\d{2})\b.*$/, '').trim(), kind: 'movie' as const, seriesTitle: null, season: null, episode: null, year: year ? +year[1] : null }
}

async function duration(file: string) {
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1', file], { timeout: 10000 })
    return Math.round(Number(stdout.trim()) || 0)
  } catch { return 0 }
}

export async function scanLibraries(extraDirs: string[] = []) {
  const configured = getSetting('MEDIA_DIRS', '/srv/media,/media,/mnt').split(',').map(v => v.trim()).filter(Boolean)
  const directories = [...new Set([...configured, ...extraDirs])]
  const files = directories.flatMap(dir => walk(dir))
  db.prepare('UPDATE media SET available=0 WHERE path IS NOT NULL').run()
  const upsert = db.prepare(`INSERT INTO media(path,title,kind,series_title,season,episode,year,duration,genres,overview,available)
    VALUES(@path,@title,@kind,@seriesTitle,@season,@episode,@year,@duration,'[]','',1)
    ON CONFLICT(path) DO UPDATE SET available=1,title=excluded.title,duration=excluded.duration`)
  for (const file of files) upsert.run({ path: file, ...parseMediaName(file), duration: await duration(file) })
  return { directories, found: files.length }
}
