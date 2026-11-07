import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import { z } from 'zod'
import { db, getSetting, setSetting } from './db.js'
import { detectDrives, isLibraryScanRunning, scanDrive, scanLibraries, type ScanProgress } from './scanner.js'
import { addTorrent, listTorrents, searchTorznab, testQbit, testTorznab } from './torrents.js'
import { remoteEvents, startCecBridge } from './cec.js'
import { applyUpdate, checkForUpdate, isUpdateRunning } from './updater.js'
import { artworkDir, testOmdb } from './omdb.js'
import { getProfilePreferences, getRecommendationsForProfile, getRelated, getTrending, saveProfilePreferences } from './recommendations.js'
import { hasBeenWatched, WATCHED_RATIO } from './progress.js'

const app = express()
const port = Number(process.env.PORT || 4242)
const torrentSearchEvents = new EventEmitter()
const preferenceEvents = new EventEmitter()
type LibraryScanJob={id:string;device:string;status:'waiting'|'running'|'complete'|'error';phase:'mounting'|ScanProgress['phase'];current:number;total:number;percent:number;found:number;enriched:number;recent:NonNullable<ScanProgress['latest']>[];error?:string}
const libraryScanJobs=new Map<string,LibraryScanJob>()
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use('/api/artwork',express.static(artworkDir,{maxAge:'30d',immutable:true}))

function localIp() {
  for (const addresses of Object.values(os.networkInterfaces())) for (const address of addresses || [])
    if (address.family === 'IPv4' && !address.internal) return address.address
  return 'localhost'
}

function parseMedia(row: any) { return { ...row, genres: JSON.parse(row.genres || '[]'), available: Boolean(row.available), completed: Boolean(row.completed) } }
function collapseSeriesMedia(items:any[]){
  const unique=new Map<string,any>()
  for(const item of items){
    const seriesTitle=String(item.series_title||item.title).trim(),key=item.kind==='series'?`series:${seriesTitle.toLocaleLowerCase('fr')}`:`movie:${item.id}`
    if(!unique.has(key))unique.set(key,item.kind==='series'?{...item,title:seriesTitle}:item)
  }
  return [...unique.values()]
}

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
  const data = z.object({ name: z.string().trim().min(1).max(12), avatar: z.string().default('bot'), color: z.string().default('#f21d45'), max_age: z.number().int().min(3).max(18).default(18) }).parse(req.body)
  const result = db.prepare('INSERT INTO profiles(name,avatar,color,max_age) VALUES(@name,@avatar,@color,@max_age)').run(data)
  res.status(201).json({ id: result.lastInsertRowid, ...data })
})
app.put('/api/profiles/:id', (req, res) => {
  const data = z.object({ name: z.string().trim().min(1).max(12), avatar: z.string().default('bot'), color: z.string().default('#f21d45'), max_age: z.number().int().min(3).max(18).default(18) }).parse(req.body)
  db.prepare('UPDATE profiles SET name=@name,avatar=@avatar,color=@color,max_age=@max_age WHERE id=@id').run({ ...data, id: req.params.id })
  res.json({ id: Number(req.params.id), ...data })
})
app.delete('/api/profiles/:id', (req, res) => {
  const count = db.prepare('SELECT count(*) AS n FROM profiles').get() as { n: number }
  if (count.n <= 1) return res.status(400).json({ error: 'Au moins un profil est nécessaire' })
  db.transaction(() => {
    db.prepare('DELETE FROM ratings WHERE profile_id=?').run(req.params.id)
    db.prepare('DELETE FROM progress WHERE profile_id=?').run(req.params.id)
    db.prepare('DELETE FROM profile_genre_preferences WHERE profile_id=?').run(req.params.id)
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
  const profileId = Number(req.query.profileId)
  const withProgress = Number.isInteger(profileId) && profileId > 0
  const select = withProgress
    ? 'SELECT m.*,p.position,p.completed FROM media m LEFT JOIN progress p ON p.media_id=m.id AND p.profile_id=? WHERE m.available=1 AND m.age_rating<=COALESCE((SELECT max_age FROM profiles WHERE id=?),18)'
    : 'SELECT m.*,NULL AS position,0 AS completed FROM media m WHERE m.available=1'
  const params:any[] = withProgress ? [profileId,profileId] : []
  if (kind === 'movie' || kind === 'series') params.push(kind)
  const rows = db.prepare(`${select}${kind === 'movie' || kind === 'series' ? ' AND m.kind=?' : ''} ORDER BY m.added_at DESC`).all(...params)
  res.json(rows.map(parseMedia))
})
app.get('/api/series', (req, res) => {
  const profileId=Number(req.query.profileId)
  const profile=Number.isInteger(profileId)&&profileId>0?db.prepare('SELECT max_age FROM profiles WHERE id=?').get(profileId) as {max_age:number}|undefined:undefined
  const rows=(profile
    ? db.prepare(`SELECT m.*,p.position,p.completed FROM media m LEFT JOIN progress p ON p.media_id=m.id AND p.profile_id=?
        WHERE m.available=1 AND m.kind='series' AND m.age_rating<=? ORDER BY COALESCE(m.series_title,m.title),m.season,m.episode`).all(profileId,profile.max_age)
    : db.prepare(`SELECT m.*,NULL AS position,0 AS completed FROM media m WHERE m.available=1 AND m.kind='series'
        ORDER BY COALESCE(m.series_title,m.title),m.season,m.episode`).all()) as any[]
  const groups=new Map<string,any>()
  for(const row of rows){
    const title=row.series_title||row.title, key=title.toLocaleLowerCase('fr')
    let group=groups.get(key)
    if(!group){group={id:key,title,year:row.year||0,age_rating:row.age_rating||0,genres:new Set<string>(),overview:row.overview||'',poster:row.poster,backdrop:row.backdrop,seasons:new Set<number>(),episodes:[]};groups.set(key,group)}
    const episode=parseMedia(row)
    group.episodes.push(episode)
    for(const genre of episode.genres)group.genres.add(genre)
    group.seasons.add(Number(row.season)||1)
    if(!group.overview&&row.overview)group.overview=row.overview
    if(!group.poster&&row.poster)group.poster=row.poster
    if(!group.backdrop&&row.backdrop)group.backdrop=row.backdrop
  }
  res.json([...groups.values()].map(group=>({...group,genres:[...group.genres],seasons:[...group.seasons].sort((a,b)=>a-b),episodes:group.episodes.sort((a:any,b:any)=>(a.season||1)-(b.season||1)||(a.episode||0)-(b.episode||0))})))
})
app.get('/api/media/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM media WHERE id=?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Média introuvable' })
  res.json(parseMedia(row))
})
app.post('/api/library/scan', async (_req, res, next) => { try { res.json(await scanLibraries()) } catch (e) { next(e) } })
app.get('/api/library/drives',async(_req,res,next)=>{try{res.json(await detectDrives())}catch(e){next(e)}})
app.post('/api/library/drives/scan',async(req,res,next)=>{
  try{
    if(isLibraryScanRunning())return res.status(409).json({error:'Une analyse de la médiathèque est déjà en cours.'})
    const {device}=z.object({device:z.string().min(5).max(200)}).parse(req.body)
    const drive=(await detectDrives()).find(item=>item.device===device)
    if(!drive)return res.status(404).json({error:'Ce disque USB n’est plus connecté.'})
    const id=randomUUID(),job:LibraryScanJob={id,device,status:'waiting',phase:'mounting',current:0,total:0,percent:0,found:0,enriched:0,recent:[]}
    libraryScanJobs.set(id,job)
    res.status(202).json(job)
    void (async()=>{
      job.status='running'
      try{
        await scanDrive(device,progress=>{job.phase=progress.phase;job.current=progress.current;job.total=progress.total;job.percent=progress.percent;job.found=progress.found;job.enriched=progress.enriched;if(progress.latest){job.recent=[progress.latest,...job.recent.filter(item=>item.title!==progress.latest?.title)].slice(0,6)}})
        job.status='complete';job.phase='complete';job.percent=100
      }catch(error:any){job.status='error';job.error=error?.message||'L’analyse du disque a échoué.'}
      setTimeout(()=>libraryScanJobs.delete(id),60*60*1000)
    })()
  }catch(e){next(e)}
})
app.get('/api/library/drives/scan/:id',(req,res)=>{const job=libraryScanJobs.get(req.params.id);if(!job)return res.status(404).json({error:'Analyse introuvable ou terminée depuis trop longtemps.'});res.json(job)})
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
  const media=db.prepare('SELECT duration FROM media WHERE id=?').get(data.mediaId) as {duration:number}|undefined
  if(!media)return res.status(404).json({error:'Média introuvable'})
  const previous=db.prepare('SELECT completed FROM progress WHERE profile_id=? AND media_id=?').get(data.profileId,data.mediaId) as {completed:number}|undefined
  const completed=hasBeenWatched(data.position,media.duration,data.completed||Boolean(previous?.completed))
  db.prepare(`INSERT INTO progress(profile_id,media_id,position,completed) VALUES(@profileId,@mediaId,@position,@completed)
    ON CONFLICT(profile_id,media_id) DO UPDATE SET position=excluded.position,completed=excluded.completed,updated_at=CURRENT_TIMESTAMP`).run({ ...data, completed: Number(completed) })
  res.json({ ok: true, completed })
})
app.get('/api/progress/continue', (req, res) => {
  const profileId = Number(req.query.profileId)
  if (!Number.isInteger(profileId)) return res.status(400).json({ error: 'Profil invalide' })
  const rows = db.prepare(`SELECT m.*,p.position FROM progress p JOIN media m ON m.id=p.media_id
    WHERE p.profile_id=? AND p.completed=0 AND p.position>0 AND m.duration>0
      AND p.position<m.duration*? AND (m.duration-p.position)>300 AND m.available=1
    ORDER BY p.updated_at DESC`).all(profileId,WATCHED_RATIO)
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
  const eligible = (db.prepare('SELECT * FROM media WHERE available=1 AND age_rating<=?').all(age) as any[])
    .filter(m => data.kind === 'all' || m.kind === data.kind).filter(m => !data.maxDuration || m.duration <= data.maxDuration * 60)
    .sort((a,b) => b.year-a.year).map(parseMedia)
  const media=collapseSeriesMedia(eligible).slice(0,12)
  res.json({ ageLimit: age, items: media })
})
app.get('/api/recommendations/profile/:id', async (req, res, next) => {
  try { const page=z.coerce.number().int().min(1).max(10).default(1).parse(req.query.page);res.json(await getRecommendationsForProfile(Number(req.params.id),page)) }
  catch (e) { next(e) }
})
app.get('/api/profiles/:id/preferences', (req, res, next) => {
  try { res.json(getProfilePreferences(Number(req.params.id))) }
  catch (e) { next(e) }
})
app.put('/api/profiles/:id/preferences', (req, res, next) => {
  try {
    const { genres } = z.object({ genres:z.array(z.string()).max(30) }).parse(req.body)
    const profileId=Number(req.params.id)
    saveProfilePreferences(profileId, genres)
    preferenceEvents.emit('change', profileId)
    res.json(getProfilePreferences(profileId))
  } catch (e) { next(e) }
})
app.get('/api/recommendations/preferences/events', (req, res) => {
  const profileId=Number(req.query.profileId)
  res.set({ 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', Connection:'keep-alive' })
  res.flushHeaders()
  const send=(changedId:number)=>{if(changedId===profileId)res.write(`data: ${JSON.stringify({profileId})}\n\n`)}
  preferenceEvents.on('change',send)
  const heartbeat=setInterval(()=>res.write(': ping\n\n'),20000)
  req.on('close',()=>{clearInterval(heartbeat);preferenceEvents.off('change',send)})
})
app.get('/api/recommendations/preferences/qr', async (req, res, next) => {
  try {
    const profileId = z.coerce.number().int().positive().parse(req.query.profileId)
    const profile = db.prepare('SELECT id FROM profiles WHERE id=?').get(profileId)
    if (!profile) return res.status(404).json({ error:'Profil introuvable' })
    const url = `http://${localIp()}:${port}/recommendation-preferences?profileId=${profileId}`
    res.json({ url, qr:await QRCode.toDataURL(url, { margin:1, width:320, color:{ dark:'#07111f', light:'#ffffff' } }) })
  } catch (e) { next(e) }
})
app.get('/api/catalog/trending', async (req,res,next)=>{
  try{
    const data=z.object({kind:z.enum(['movie','series']),profileId:z.coerce.number().int().positive().optional()}).parse(req.query)
    res.json(await getTrending(data.kind,data.profileId))
  }catch(e){next(e)}
})
app.get('/api/catalog/related', async (req,res,next)=>{
  try{
    const data=z.object({kind:z.enum(['movie','series']),tmdbId:z.coerce.number().int().positive().optional(),title:z.string().optional(),year:z.coerce.number().int().optional(),profileId:z.coerce.number().int().positive().optional()}).parse(req.query)
    res.json(await getRelated(data))
  }catch(e){next(e)}
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

const publicSettings = ['MEDIA_DIRS','DOWNLOAD_DIR','TMDB_API_KEY','OMDB_API_KEY','QBITTORRENT_URL','QBITTORRENT_USER','QBITTORRENT_PASSWORD','TORZNAB_URL','TORZNAB_API_KEY','DOWNLOAD_LIMIT','UPLOAD_LIMIT']
app.get('/api/settings', (_req, res) => res.json(Object.fromEntries(publicSettings.map(k => [k, getSetting(k)]))))
app.put('/api/settings', (req, res) => { for (const key of publicSettings) if (typeof req.body[key] === 'string') setSetting(key, req.body[key]); res.json({ ok: true }) })
app.post('/api/settings/torznab/test', async (req, res, next) => {
  try {
    const data = z.object({ url: z.string().trim().optional(), apiKey: z.string().optional() }).parse(req.body)
    res.json(await testTorznab(data.url, data.apiKey))
  } catch (e) { next(e) }
})
app.post('/api/settings/omdb/test', async (req, res, next) => {
  try { res.json(await testOmdb(z.object({ apiKey:z.string() }).parse(req.body).apiKey)) }
  catch (e) { next(e) }
})
app.post('/api/settings/qbittorrent/test',async(req,res,next)=>{
  try{const data=z.object({url:z.string().trim().optional(),username:z.string().optional(),password:z.string().optional()}).parse(req.body);res.json(await testQbit(data.url,data.username,data.password))}
  catch(e){next(e)}
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
app.post('/api/system/reboot', (req, res, next) => {
  try {
    z.object({ confirm:z.literal('RESTART') }).parse(req.body)
    if(process.platform!=='linux')return res.status(501).json({error:'Le redémarrage système est disponible uniquement sur le Raspberry Pi.'})
    res.status(202).json({ok:true})
    setTimeout(()=>{
      const child=spawn('/usr/bin/sudo',['-n','/usr/bin/systemctl','reboot'],{detached:true,stdio:'ignore'})
      child.on('error',error=>console.error('Impossible de redémarrer le système',error))
      child.unref()
    },600)
  } catch(e){next(e)}
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
setInterval(() => {if(!isLibraryScanRunning())scanLibraries().catch(console.error)}, 30000)
startCecBridge()
