import path from 'node:path'
import {db, getSetting} from './db.js'
import {isLibraryScanRunning, scanDownloadedContent} from './scanner.js'
import {listTorrents} from './torrents.js'
import {isPlaybackActive} from './playback-state.js'
import {isUiIdle} from './activity-state.js'

export type CompletedTorrent={hash:string;name:string;progress:number;amount_left?:number;category?:string;content_path?:string;save_path?:string;state?:string}

export function completedMoodflixTorrents(items:CompletedTorrent[]){
  return items.filter(item=>item.category==='moodflix'&&(item.progress>=1||item.amount_left===0)&&Boolean(item.hash))
}

let running=false,lastError=''
const retryAfter=new Map<string,number>()

export async function importCompletedTorrents(){
  if(running||isLibraryScanRunning()||isPlaybackActive()||!isUiIdle())return
  running=true
  try{
    const completed=completedMoodflixTorrents(await listTorrents() as CompletedTorrent[])
    const imported=db.prepare('SELECT 1 FROM torrent_imports WHERE hash=?'),save=db.prepare('INSERT OR REPLACE INTO torrent_imports(hash,content_path) VALUES(?,?)')
    const torrent=completed.find(item=>!imported.get(item.hash)&&(retryAfter.get(item.hash)||0)<=Date.now())
    if(torrent){
      const contentPath=torrent.content_path||torrent.save_path&&path.join(torrent.save_path,torrent.name)||getSetting('DOWNLOAD_DIR','/srv/media/downloads')
      try{
        const result=await scanDownloadedContent(contentPath)
        save.run(torrent.hash,contentPath)
        retryAfter.delete(torrent.hash)
        if(result.found>0)console.log(`Torrent intégré à la médiathèque : ${torrent.name} (${result.found} vidéo${result.found>1?'s':''})`)
        else console.log(`Torrent ignoré par la médiathèque (aucune vidéo compatible) : ${torrent.name}`)
      }catch(error:any){retryAfter.set(torrent.hash,Date.now()+10*60*1000);console.warn(`Import du torrent « ${torrent.name} » reporté : ${error?.message||error}`)}
    }
    lastError=''
  }catch(error:any){
    const message=error?.message||String(error)
    if(message!==lastError){console.warn(`Surveillance des torrents terminés : ${message}`);lastError=message}
  }finally{running=false}
}

export function startCompletedTorrentMonitor(intervalMs=60000){
  const initial=setTimeout(()=>void importCompletedTorrents(),20000);initial.unref()
  const timer=setInterval(()=>void importCompletedTorrents(),intervalMs);timer.unref()
  return()=>{clearTimeout(initial);clearInterval(timer)}
}
