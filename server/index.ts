import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import QRCode from 'qrcode'
import { z } from 'zod'
import { db, getSetting, setSetting } from './db.js'
import { scanLibraries } from './scanner.js'
import { addTorrent, listTorrents, searchTorznab, testTorznab } from './torrents.js'
import { remoteEvents, startCecBridge } from './cec.js'
import { applyUpdate, checkForUpdate, isUpdateRunning } from './updater.js'

const app = express()
const port = Number(process.env.PORT || 4242)
const torrentSearchEvents = new EventEmitter()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

function localIp() {
  for (const addresses of Object.values(os.networkInterfaces())) for (const address of addresses || [])
    if (address.family === 'IPv4' && !address.internal) return address.address
  return 'localhost'
}

function parseMedia(row: any) { return { ...row, genres: JSON.parse(row.genres || '[]'), available: Boolean(row.available) } }

app.get('/api/health', (_req, res) => res.json({ ok: true, version: '0.1.0', ip: localIp() }))
app.get('/api/remote/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.flushHeaders()
  const send = (key: string) => res.write(`data: ${JSON.stringify({ key })}\n\n`)
  remoteEvents.on('key', send)
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20000)
  req.on('close', () => { clearInterval(heartbeat); remoteEvents.off('key', send) })
})
app.get('/api/profiles', (_req, res) => res.json(db.prepare('SELECT * FROM profiles ORDER BY id').all()))
app.post('/api/profiles', (req, res) => {
  const data = z.object({ name: z.string().min(1).max(30), avatar: z.string().default('bot'), color: z.string().default('#f21d45'), max_age: z.number().int().min(3).max(18).default(18) }).parse(req.body)
  const result = db.prepare('INSERT INTO profiles(name,avatar,color,max_age) VALUES(@name,@avatar,@color,@max_age)').run(data)
  res.status(201).json({ id: result.lastInsertRowid, ...data })
})
app.put('/api/profiles/:id', (req, res) => {
  const data = z.object({ name: z.string().min(1).max(30), avatar: z.string().default('bot'), color: z.string().default('#f21d45'), max_age: z.number().int().min(3).max(18).default(18) }).parse(req.body)
  db.prepare('UPDATE profiles SET name=@name,avatar=@avatar,color=@color,max_age=@max_age WHERE id=@id').run({ ...data, id: req.params.id })
  res.json({ id: Number(req.params.id), ...data })
})
app.delete('/api/profiles/:id', (req, res) => {
  const count = db.prepare('SELECT count(*) AS n FROM profiles').get() as { n: number }
  if (count.n <= 1) return res.status(400).json({ error: 'Au moins un profil est nécessaire' })
  db.transaction(() => {
    db.prepare('DELETE FROM ratings WHERE profile_id=?').run(req.params.id)
    db.prepare('DELETE FROM progress WHERE profile_id=?').run(req.params.id)
    db.prepare('DELETE FROM profiles WHERE id=?').run(req.params.id)
  })()
  res.json({ ok: true })
})
app.put('/api/profiles/:id/rating', (req, res) => {
  const data = z.object({ mediaId: z.number().int(), score: z.number().int().min(1).max(5) }).parse(req.body)
  db.prepare('INSERT INTO ratings(profile_id,media_id,score) VALUES(?,?,?) ON CONFLICT(profile_id,media_id) DO UPDATE SET score=excluded.score').run(req.params.id, data.mediaId, data.score)
  res.json({ ok: true })
})

app.get('/api/media', (req, res) => {
  const kind = req.query.kind
  const rows = kind === 'movie' || kind === 'series'
    ? db.prepare('SELECT * FROM media WHERE available=1 AND kind=? ORDER BY added_at DESC').all(kind)
    : db.prepare('SELECT * FROM media WHERE available=1 ORDER BY added_at DESC').all()
  res.json(rows.map(parseMedia))
})
app.get('/api/media/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM media WHERE id=?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Média introuvable' })
  res.json(parseMedia(row))
})
app.post('/api/library/scan', async (_req, res, next) => { try { res.json(await scanLibraries()) } catch (e) { next(e) } })
app.get('/api/media/:id/stream', (req, res) => {
  const item = db.prepare('SELECT path FROM media WHERE id=?').get(req.params.id) as { path?: string } | undefined
  if (!item?.path || !fs.existsSync(item.path)) return res.status(404).json({ error: 'Fichier indisponible' })
  const stat = fs.statSync(item.path), range = req.headers.range
  if (!range) { res.setHeader('Content-Length', stat.size); return fs.createReadStream(item.path).pipe(res) }
  const [startText, endText] = range.replace(/bytes=/, '').split('-')
  const start = Number(startText), end = endText ? Number(endText) : stat.size - 1
  res.status(206).set({ 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end-start+1, 'Content-Type': 'video/mp4' })
  fs.createReadStream(item.path, { start, end }).pipe(res)
})
app.put('/api/progress', (req, res) => {
  const data = z.object({ profileId: z.number().int(), mediaId: z.number().int(), position: z.number().nonnegative(), completed: z.boolean().default(false) }).parse(req.body)
  db.prepare(`INSERT INTO progress(profile_id,media_id,position,completed) VALUES(@profileId,@mediaId,@position,@completed)
    ON CONFLICT(profile_id,media_id) DO UPDATE SET position=excluded.position,completed=excluded.completed,updated_at=CURRENT_TIMESTAMP`).run({ ...data, completed: Number(data.completed) })
  res.json({ ok: true })
})
app.get('/api/progress/continue', (req, res) => {
  const profileId = Number(req.query.profileId)
  if (!Number.isInteger(profileId)) return res.status(400).json({ error: 'Profil invalide' })
  const rows = db.prepare(`SELECT m.*,p.position FROM progress p JOIN media m ON m.id=p.media_id
    WHERE p.profile_id=? AND p.completed=0 AND p.position>0 AND (m.duration-p.position)>300 AND m.available=1
    ORDER BY p.updated_at DESC`).all(profileId)
  res.json(rows.map(parseMedia))
})
app.get('/api/progress/:mediaId', (req, res) => {
  const row = db.prepare('SELECT position,completed FROM progress WHERE profile_id=? AND media_id=?').get(Number(req.query.profileId), req.params.mediaId) as any
  res.json({ position: row?.position || 0, completed: Boolean(row?.completed) })
})
app.post('/api/recommendations', (req, res) => {
  const data = z.object({ participants: z.array(z.number().int()).min(1), maxDuration: z.number().int().positive().optional(), kind: z.enum(['movie','series','all']).default('all') }).parse(req.body)
  const placeholders = data.participants.map(() => '?').join(',')
  const profiles = db.prepare(`SELECT * FROM profiles WHERE id IN (${placeholders})`).all(...data.participants) as any[]
  const age = Math.min(...profiles.map(p => p.max_age))
  const media = (db.prepare('SELECT * FROM media WHERE available=1 AND age_rating<=?').all(age) as any[])
    .filter(m => data.kind === 'all' || m.kind === data.kind).filter(m => !data.maxDuration || m.duration <= data.maxDuration * 60)
    .sort((a,b) => b.year-a.year).slice(0, 12).map(parseMedia)
  res.json({ ageLimit: age, items: media })
})

app.get('/api/torrents', async (_req, res, next) => { try { res.json(await listTorrents()) } catch (e) { next(e) } })
app.get('/api/torrents/search', async (req, res, next) => { try { res.json(await searchTorznab(String(req.query.q || ''), String(req.query.kind || 'all'))) } catch (e) { next(e) } })
app.post('/api/torrents', async (req, res, next) => { try { const { url } = z.object({ url: z.string().min(5) }).parse(req.body); await addTorrent(url); res.status(201).json({ ok: true }) } catch (e) { next(e) } })
app.get('/api/torrents/search/qr', async (_req, res) => {
  const url = `http://${localIp()}:${port}/torrent-search`
  res.json({ url, qr: await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#07111f', light: '#ffffff' } }) })
})
app.get('/api/torrents/search/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.flushHeaders()
  const send = (payload: { query: string; kind: string }) => res.write(`data: ${JSON.stringify(payload)}\n\n`)
  torrentSearchEvents.on('search', send)
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20000)
  req.on('close', () => { clearInterval(heartbeat); torrentSearchEvents.off('search', send) })
})
app.post('/api/torrents/search/remote', (req, res) => {
  const data = z.object({ query: z.string().trim().min(1).max(200), kind: z.enum(['all','movie','series']).default('all') }).parse(req.body)
  torrentSearchEvents.emit('search', data)
  res.json({ ok: true })
})

const publicSettings = ['MEDIA_DIRS','DOWNLOAD_DIR','TMDB_API_KEY','QBITTORRENT_URL','QBITTORRENT_USER','QBITTORRENT_PASSWORD','TORZNAB_URL','TORZNAB_API_KEY','DOWNLOAD_LIMIT','UPLOAD_LIMIT']
app.get('/api/settings', (_req, res) => res.json(Object.fromEntries(publicSettings.map(k => [k, getSetting(k)]))))
app.put('/api/settings', (req, res) => { for (const key of publicSettings) if (typeof req.body[key] === 'string') setSetting(key, req.body[key]); res.json({ ok: true }) })
app.post('/api/settings/torznab/test', async (req, res, next) => {
  try {
    const data = z.object({ url: z.string().trim().optional(), apiKey: z.string().optional() }).parse(req.body)
    res.json(await testTorznab(data.url, data.apiKey))
  } catch (e) { next(e) }
})
app.get('/api/update/check', async (_req, res, next) => { try { res.json(await checkForUpdate()) } catch (e) { next(e) } })
app.get('/api/update/state', (_req, res) => res.json({ updating: isUpdateRunning() }))
app.post('/api/update/apply', async (req, res, next) => {
  try {
    z.object({ confirm: z.literal(true) }).parse(req.body)
    const status = await applyUpdate()
    const restarting = status.commits.length > 0
    res.json({ ok: true, status, restarting })
    if (restarting) setTimeout(() => process.exit(0), 1200)
  } catch (e) { next(e) }
})
app.get('/api/setup/qr', async (_req, res) => {
  const url = `http://${localIp()}:${port}/settings?onboarding=1`
  res.json({ url, qr: await QRCode.toDataURL(url, { margin: 1, width: 280, color: { dark: '#07111f', light: '#ffffff' } }) })
})
app.get('/api/onboarding', (_req, res) => res.json({ complete: getSetting('ONBOARDING_COMPLETE') === 'true' }))
app.post('/api/onboarding/complete', (_req, res) => { setSetting('ONBOARDING_COMPLETE', 'true'); res.json({ complete: true }) })

const dist = path.resolve('dist')
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get(/.*/, (_req,res) => res.sendFile(path.join(dist,'index.html'))) }
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error)
  res.status(400).json({ error: error?.message || 'Une erreur est survenue' })
})
app.listen(port, '0.0.0.0', () => console.log(`MoodFlix · http://0.0.0.0:${port}`))

scanLibraries().catch(console.error)
setInterval(() => scanLibraries().catch(console.error), 30000)
startCecBridge()
