import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { db, getSetting } from './db.js'
import { cacheArtwork, lookupOmdb } from './omdb.js'

const execFileAsync = promisify(execFile)
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.webm'])
const SKIPPED_DIRECTORIES = new Set(['node_modules','.git','$recycle.bin','system volume information','__macosx'])
const metadataAttempts = new Map<string, number>()
const METADATA_RETRY_MS = 6 * 60 * 60 * 1000
let scanRunning=false

export type DriveInfo={id:string;device:string;name:string;label:string;model:string;size:number;fileSystem:string;mountpoint:string;mounted:boolean}
export type ScanProgress={phase:'discovering'|'scanning'|'complete';current:number;total:number;percent:number;found:number;enriched:number;latest?:{title:string;kind:'movie'|'series';poster?:string}}

export function isVideoCandidate(filename:string){
  return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase())
}

async function walk(dir:string,files:string[]=[],onFound?:(count:number)=>void):Promise<string[]>{
  let entries:fs.Dirent[]
  try{entries=await fs.promises.readdir(dir,{withFileTypes:true})}catch{return files}
  for(const entry of entries){
    const full=path.join(dir,entry.name)
    if(entry.isDirectory()&&!SKIPPED_DIRECTORIES.has(entry.name.toLowerCase()))await walk(full,files,onFound)
    else if(entry.isFile()&&isVideoCandidate(entry.name)){files.push(full);onFound?.(files.length)}
    if(files.length&&files.length%50===0)await new Promise<void>(resolve=>setImmediate(resolve))
  }
  return files
}

export function parseLsblk(payload:any):DriveInfo[]{
  const drives:DriveInfo[]=[]
  const visit=(node:any,parent:any={})=>{
    const transport=node.tran||parent.transport||'',removable=Number(node.rm||0)===1||Boolean(parent.removable),model=String(node.model||parent.model||'').trim(),size=Number(node.size||parent.size||0)
    const mountpoints=(Array.isArray(node.mountpoints)?node.mountpoints:[node.mountpoint]).filter((value:any)=>typeof value==='string'&&value)
    const device=String(node.path||node.name||'')
    if(node.fstype&&device&&(transport==='usb'||removable)&&!['loop','rom'].includes(node.type)){
      const label=String(node.label||'').trim(),fallback=model||path.basename(device)
      drives.push({id:device,device,name:label||fallback,label,model,size:Number(node.size||size),fileSystem:String(node.fstype),mountpoint:mountpoints[0]||'',mounted:Boolean(mountpoints[0])})
    }
    for(const child of node.children||[])visit(child,{transport,removable,model,size})
  }
  for(const node of payload?.blockdevices||[])visit(node)
  return drives.sort((a,b)=>a.name.localeCompare(b.name,'fr'))
}

export async function detectDrives():Promise<DriveInfo[]>{
  if(process.platform==='win32')return[]
  try{
    const {stdout}=await execFileAsync('lsblk',['--json','--bytes','--output','NAME,PATH,TYPE,FSTYPE,LABEL,SIZE,MOUNTPOINTS,RM,TRAN,MODEL'],{timeout:8000,maxBuffer:2*1024*1024})
    return parseLsblk(JSON.parse(stdout))
  }catch(error:any){throw new Error(`Impossible de détecter les disques USB : ${error?.message||'lsblk indisponible'}`)}
}

export async function ensureDriveMounted(device:string){
  let drive=(await detectDrives()).find(item=>item.device===device)
  if(!drive)throw new Error('Ce disque USB n’est plus connecté.')
  if(drive.mountpoint)return drive
  try{await execFileAsync('udisksctl',['mount','-b',device],{timeout:20000,maxBuffer:1024*1024})}
  catch(error:any){throw new Error(`Le disque est détecté mais ne peut pas être monté automatiquement : ${error?.stderr||error?.message||'autorisation refusée'}`)}
  drive=(await detectDrives()).find(item=>item.device===device)
  if(!drive?.mountpoint)throw new Error('Le disque a été monté, mais son point de montage reste introuvable.')
  return drive
}

export function parseMediaName(file:string){
  const base=path.basename(file,path.extname(file)).replace(/[._]+/g,' ').replace(/\s+/g,' ').trim()
  const episode=base.match(/^(.+?)(?:\s*[-–—]\s*|\s+)(?:S(?:eason|aison)?\s*(\d{1,2})\s*E(?:pisode)?\s*(\d{1,3})|(\d{1,2})\s*x\s*(\d{1,3}))(?:\b|\s|[-–—])/i)
  const year=base.match(/\b(19\d{2}|20\d{2})\b/)
  if(episode){const season=Number(episode[2]||episode[4]),number=Number(episode[3]||episode[5]),seriesTitle=episode[1].trim();return{title:`${seriesTitle} — S${season} E${number}`,kind:'series' as const,seriesTitle,season,episode:number,year:year?+year[1]:null}}

  // Beaucoup de bibliothèques utilisent Show/Saison 01/02 - Titre.mkv : le nom
  // de fichier ne contient alors pas S01E02, mais le dossier fournit la saison.
  const parent=path.basename(path.dirname(file)).replace(/[._]+/g,' ').trim()
  const seasonFolder=parent.match(/^(?:season|saison)\s*(\d{1,2})$/i)
  const folderEpisode=base.match(/^(?:e(?:pisode)?|ep(?:isode)?)?\s*(\d{1,3})(?:\b|\s*[-–—])/i)
    ||base.match(/(?:^|\s)(?:e(?:pisode)?|ep(?:isode)?)\s*(\d{1,3})\b/i)
    ||base.match(/(?:^|\s[-–—]\s*)(\d{1,3})(?:\b|\s*[-–—])/i)
  if(seasonFolder&&folderEpisode){const season=Number(seasonFolder[1]),number=Number(folderEpisode[1]),seriesTitle=path.basename(path.dirname(path.dirname(file))).replace(/[._]+/g,' ').trim();return{title:`${seriesTitle} — S${season} E${number}`,kind:'series' as const,seriesTitle,season,episode:number,year:year?+year[1]:null}}
  return{title:base.replace(/\b(19\d{2}|20\d{2})\b.*$/,'').trim(),kind:'movie' as const,seriesTitle:null,season:null,episode:null,year:year?+year[1]:null}
}

async function probeVideo(file:string):Promise<number|null>{
  try{
    const {stdout}=await execFileAsync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_type:format=duration','-of','json',file],{timeout:10000,maxBuffer:1024*1024})
    const data=JSON.parse(stdout) as {streams?:Array<{codec_type?:string}>;format?:{duration?:string}}
    if(!data.streams?.some(stream=>stream.codec_type==='video'))return null
    return Math.round(Number(data.format?.duration)||0)
  }catch{return null}
}

function markUnavailable(directories:string[],all:boolean){
  if(all){db.prepare('UPDATE media SET available=0 WHERE path IS NOT NULL').run();return}
  const rows=db.prepare('SELECT id,path FROM media WHERE path IS NOT NULL').all() as {id:number;path:string}[]
  const roots=directories.map(directory=>path.resolve(directory)),update=db.prepare('UPDATE media SET available=0 WHERE id=?')
  db.transaction(()=>{for(const row of rows){const item=path.resolve(row.path);if(roots.some(root=>item===root||item.startsWith(root+path.sep)))update.run(row.id)}})()
}

async function scanDirectories(directories:string[],resetAll:boolean,onProgress?:(progress:ScanProgress)=>void,lockAcquired=false){
  if(!lockAcquired){
    if(scanRunning)throw new Error('Une analyse de la médiathèque est déjà en cours.')
    scanRunning=true
  }
  try{
    let discovered=0
    onProgress?.({phase:'discovering',current:0,total:0,percent:0,found:0,enriched:0})
    const files:string[]=[]
    for(const directory of directories)await walk(directory,files,count=>{discovered=count;onProgress?.({phase:'discovering',current:count,total:0,percent:0,found:count,enriched:0})})
    markUnavailable(directories,resetAll)
    const upsert=db.prepare(`INSERT INTO media(path,title,kind,series_title,season,episode,year,duration,genres,overview,available,file_size,file_mtime)
      VALUES(@path,@title,@kind,@seriesTitle,@season,@episode,@year,@duration,'[]','',1,@fileSize,@fileMtime)
      ON CONFLICT(path) DO UPDATE SET available=1,title=CASE WHEN media.overview='' THEN excluded.title ELSE media.title END,kind=excluded.kind,series_title=excluded.series_title,season=excluded.season,episode=excluded.episode,year=COALESCE(excluded.year,media.year),duration=excluded.duration,file_size=excluded.file_size,file_mtime=excluded.file_mtime`)
    const findMedia=db.prepare('SELECT overview,poster,duration,file_size,file_mtime FROM media WHERE path=?')
    const enrich=db.prepare(`UPDATE media SET title=CASE WHEN overview='' THEN @title ELSE title END,series_title=COALESCE(@seriesTitle,series_title),year=COALESCE(@year,year),age_rating=@ageRating,genres=@genres,overview=CASE WHEN overview='' THEN @overview ELSE overview END,poster=CASE WHEN poster IS NULL OR poster='' THEN @poster ELSE poster END WHERE path=@path`)
    const updatePoster=db.prepare('UPDATE media SET poster=? WHERE path=?')
    let enriched=0,current=0,found=0
    for(const file of files){
      const identity=parseMediaName(file)
      let latest:ScanProgress['latest']
      try{
        const existing=findMedia.get(file) as {overview:string;poster:string|null;duration:number;file_size:number;file_mtime:number}|undefined
        const stat=await fs.promises.stat(file)
        const unchanged=Boolean(existing&&existing.file_size===stat.size&&existing.file_mtime===Math.round(stat.mtimeMs)&&existing.duration>=0)
        const mediaDuration=unchanged?existing!.duration:await probeVideo(file)
        if(mediaDuration===null)continue
        found++
        upsert.run({path:file,...identity,duration:mediaDuration,fileSize:stat.size,fileMtime:Math.round(stat.mtimeMs)})
        if(existing?.poster&&/^https?:\/\//i.test(existing.poster)){try{const cached=await cacheArtwork(existing.poster);if(cached!==existing.poster)updatePoster.run(cached,file)}catch{}}
        const lastAttempt=metadataAttempts.get(file)||0
        if(getSetting('OMDB_API_KEY')&&(!existing?.overview||!existing?.poster)&&Date.now()-lastAttempt>=METADATA_RETRY_MS){
          metadataAttempts.set(file,Date.now())
          try{const metadata=await lookupOmdb(identity);if(metadata){enrich.run({path:file,...metadata,genres:JSON.stringify(metadata.genres)});enriched++}}catch{}
        }
        const saved=findMedia.get(file) as {poster:string|null}|undefined
        latest={title:identity.title,kind:identity.kind,poster:saved?.poster||undefined}
      }finally{
        current++
        onProgress?.({phase:'scanning',current,total:files.length,percent:files.length?Math.round(current/files.length*100):100,found,enriched,latest})
      }
    }
    const result={directories,found,enriched}
    onProgress?.({phase:'complete',current:files.length,total:files.length,percent:100,found,enriched})
    return result
  }finally{if(!lockAcquired)scanRunning=false}
}

export function isLibraryScanRunning(){return scanRunning}

export async function scanLibraries(extraDirs:string[]=[]){
  const configured=getSetting('MEDIA_DIRS','/srv/media,/media,/mnt').split(',').map(value=>value.trim()).filter(Boolean)
  return scanDirectories([...new Set([...configured,...extraDirs])],true)
}

export async function scanDrive(device:string,onProgress?:(progress:ScanProgress)=>void){
  if(scanRunning)throw new Error('Une analyse de la médiathèque est déjà en cours.')
  scanRunning=true
  try{
    const drive=await ensureDriveMounted(device)
    const result=await scanDirectories([drive.mountpoint],false,onProgress,true)
    return{...result,drive}
  }finally{scanRunning=false}
}
