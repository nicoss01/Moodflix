import { parseStringPromise } from 'xml2js'
import fs from 'node:fs'
import path from 'node:path'
import { getSetting } from './db.js'

let qbitCookie = ''
let qbitCookieBase = ''
let torrentCache:any[]=[]
let torrentCacheAt=0
let torrentRequest:Promise<any[]>|null=null
const TORRENT_CACHE_MS=2500
const VIDEO_EXTENSIONS=new Set(['.mp4','.mkv','.avi','.mov','.m4v','.webm'])

function invalidateTorrentCache(){torrentCache=[];torrentCacheAt=0}

export function torrentContentExists(contentPath?:string){
  if(!contentPath)return false
  try{
    const first=fs.statSync(contentPath)
    if(first.isFile())return first.size>0&&VIDEO_EXTENSIONS.has(path.extname(contentPath).toLowerCase())
    if(!first.isDirectory())return false
    const pending=[contentPath]
    let inspected=0
    while(pending.length&&inspected<5000){
      const directory=pending.pop()!
      for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
        inspected++
        if(entry.isDirectory())pending.push(path.join(directory,entry.name))
        else if(entry.isFile()&&VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())){
          try{if(fs.statSync(path.join(directory,entry.name)).size>0)return true}catch{}
        }
        if(inspected>=5000)break
      }
    }
  }catch{}
  return false
}

export function resolveQbitBase(configured:string){
  const value=configured.trim()||'http://127.0.0.1:8080'
  let url:URL
  try{url=new URL(value)}catch{throw new Error('Adresse qBittorrent invalide. Utilisez une URL complète, par exemple http://127.0.0.1:8080.')}
  if(!['http:','https:'].includes(url.protocol))throw new Error('L’adresse qBittorrent doit commencer par http:// ou https://.')
  return value.replace(/\/$/,'')
}

export function buildQbitHeaders(base:string,cookie='',initial?:HeadersInit){
  const headers=new Headers(initial)
  // qBittorrent compare cet en-tête à Host pour protéger les requêtes POST contre les CSRF.
  headers.set('Referer',`${base}/`)
  if(cookie)headers.set('Cookie',cookie)
  return headers
}

async function authenticateQbit(base:string,username:string,password:string){
  const body = new URLSearchParams({username:username.trim()||'admin',password})
  const login = await fetch(`${base}/api/v2/auth/login`, { method:'POST', body, headers:buildQbitHeaders(base) })
  const result=(await login.text()).trim()
  if(login.status===403)throw new Error('qBittorrent a temporairement bloqué les connexions après plusieurs échecs. Redémarrez qBittorrent puis vérifiez les identifiants dans les paramètres.')
  const cookie=login.headers.get('set-cookie')?.split(';')[0]||''
  if(!login.ok||result!=='Ok.'||!cookie)throw new Error('Connexion qBittorrent refusée. Vérifiez le nom d’utilisateur et le mot de passe WebUI dans les paramètres MoodFlix.')
  return cookie
}

async function loginQbit(base:string){
  qbitCookie=await authenticateQbit(base,getSetting('QBITTORRENT_USER',''),getSetting('QBITTORRENT_PASSWORD',''))
  qbitCookieBase=base
}

async function qbit(path: string, init: RequestInit = {}) {
  const configuredBase = getSetting('QBITTORRENT_URL', '').trim()
  const base = resolveQbitBase(configuredBase)
  if(qbitCookieBase&&qbitCookieBase!==base){qbitCookie='';qbitCookieBase=''}
  let headers = buildQbitHeaders(base,qbitCookie,init.headers)
  let response = await fetch(`${base}${path}`, { ...init, headers })
  if (response.status === 403 || response.status === 401) {
    qbitCookie='';qbitCookieBase=''
    await loginQbit(base)
    headers=buildQbitHeaders(base,qbitCookie,init.headers)
    response = await fetch(`${base}${path}`, { ...init, headers })
  }
  if(response.status===403)throw new Error('qBittorrent refuse la requête (403). Vérifiez que l’adresse WebUI configurée correspond exactement à celle de qBittorrent.')
  if (!response.ok) throw new Error(`qBittorrent a répondu avec l’erreur HTTP ${response.status}.`)
  return response
}

export async function listTorrents(force=false) {
  if(!force&&torrentCacheAt&&Date.now()-torrentCacheAt<TORRENT_CACHE_MS)return torrentCache
  if(torrentRequest)return torrentRequest
  torrentRequest=(async()=>{
    const response=await qbit('/api/v2/torrents/info')
    const items=await response.json() as any[]
    torrentCache=items
    torrentCacheAt=Date.now()
    return items
  })()
  try{return await torrentRequest}finally{torrentRequest=null}
}

type QbitTorrent={hash:string;name:string;progress:number;state:string;[key:string]:unknown}

export function assertQbitAddResponse(body:string){
  const result=body.trim()
  if(result && result!=='Ok.')throw new Error(`qBittorrent a refusé le torrent${result==='Fails.'?' (réponse « Fails. »). Vérifiez le lien fourni par le moteur et le dossier de téléchargement.':` : ${result}`}`)
}

function magnetInfoHash(value:string){
  try{
    const url=new URL(value)
    if(url.protocol!=='magnet:')return ''
    const xt=url.searchParams.get('xt')||''
    return xt.toLowerCase().startsWith('urn:btih:')?xt.slice(9).toLowerCase():''
  }catch{return ''}
}

const wait=(delay:number)=>new Promise(resolve=>setTimeout(resolve,delay))

async function fillTorrentForm(form:FormData,url:string){
  if(url.toLowerCase().startsWith('magnet:')){form.set('urls',url);return}
  let response:Response
  try{response=await fetch(url,{redirect:'follow',headers:{Accept:'application/x-bittorrent, application/octet-stream;q=0.9, */*;q=0.1','User-Agent':'MoodFlix/0.1'},signal:AbortSignal.timeout(15000)})}
  catch(error:any){throw new Error(`Impossible de récupérer le fichier torrent auprès du moteur : ${error?.name==='TimeoutError'?'délai dépassé':error?.message||'erreur réseau'}`)}
  if(!response.ok)throw new Error(`Le moteur refuse le téléchargement du fichier torrent (HTTP ${response.status}).`)
  const contentType=(response.headers.get('content-type')||'').toLowerCase(),bytes=await response.arrayBuffer()
  const beginning=new TextDecoder().decode(bytes.slice(0,Math.min(bytes.byteLength,1024))).trimStart().toLowerCase()
  if(contentType.includes('text/html')||beginning.startsWith('<!doctype html')||beginning.startsWith('<html'))throw new Error('Le moteur a fourni une page web de détails à la place du fichier torrent. Vérifiez que son flux Torznab expose magneturl, downloadurl ou enclosure.')
  if(bytes.byteLength<20||(!contentType.includes('bittorrent')&&!(beginning.startsWith('d')&&beginning.includes('4:info'))))throw new Error(`Le lien fourni par le moteur ne contient pas un fichier .torrent valide${contentType?` (${contentType.split(';')[0]})`:''}.`)
  form.set('torrents',new Blob([bytes],{type:'application/x-bittorrent'}),'moodflix.torrent')
}

export async function addTorrent(url: string) {
  const before=await listTorrents(true) as QbitTorrent[]
  const previousHashes=new Set(before.map(item=>String(item.hash).toLowerCase()))
  const expectedHash=magnetInfoHash(url)
  const form = new FormData()
  await fillTorrentForm(form,url)
  form.set('category', 'moodflix')
  form.set('savepath', getSetting('DOWNLOAD_DIR', '/srv/media/downloads'))
  const response=await qbit('/api/v2/torrents/add', { method: 'POST', body: form })
  assertQbitAddResponse(await response.text())

  // L'ajout d'une URL .torrent peut demander quelques secondes à qBittorrent.
  // Ne confirmer à l'interface qu'après l'avoir réellement retrouvé dans la liste.
  for(let attempt=0;attempt<15;attempt++){
    if(attempt)await wait(400)
    const current=await listTorrents(true) as QbitTorrent[]
    const torrent=(expectedHash&&current.find(item=>String(item.hash).toLowerCase()===expectedHash))
      ||current.find(item=>!previousHashes.has(String(item.hash).toLowerCase()))
    if(torrent)return{ok:true,torrent,duplicate:false}
  }

  const duplicate=expectedHash&&before.find(item=>String(item.hash).toLowerCase()===expectedHash)
  if(duplicate)return{ok:true,torrent:duplicate,duplicate:true}
  throw new Error('qBittorrent a accepté la demande, mais le torrent n’apparaît pas dans sa liste. Vérifiez le journal qBittorrent et le lien de téléchargement fourni par le moteur.')
}

export async function deleteTorrent(hash:string){
  const body=new URLSearchParams({hashes:hash,deleteFiles:'false'})
  await qbit('/api/v2/torrents/delete',{method:'POST',body})
  invalidateTorrentCache()
  return{ok:true}
}

export async function redownloadTorrent(hash:string){
  const hashes=new URLSearchParams({hashes:hash})
  await qbit('/api/v2/torrents/recheck',{method:'POST',body:hashes})
  await qbit('/api/v2/torrents/setForceStart',{method:'POST',body:new URLSearchParams({hashes:hash,value:'true'})})
  invalidateTorrentCache()
  return{ok:true}
}

export async function testQbit(baseValue?:string,usernameValue?:string,passwordValue?:string){
  const base=resolveQbitBase(baseValue??getSetting('QBITTORRENT_URL',''))
  let cookie:string,response:Response
  try{
    cookie=await authenticateQbit(base,usernameValue??getSetting('QBITTORRENT_USER',''),passwordValue??getSetting('QBITTORRENT_PASSWORD',''))
    response=await fetch(`${base}/api/v2/app/version`,{headers:buildQbitHeaders(base,cookie),signal:AbortSignal.timeout(8000)})
  }
  catch(error:any){throw new Error(`Connexion à qBittorrent impossible : ${error?.name==='TimeoutError'?'délai dépassé':error?.message||'erreur réseau'}`)}
  if(!response.ok)throw new Error(`qBittorrent a répondu avec l’erreur HTTP ${response.status}.`)
  return{ok:true,version:(await response.text()).trim()||'inconnue'}
}

export function buildTorznabUrl(base: string, apiKey: string, params: Record<string, string>) {
  let url: URL
  try { url = new URL(base.trim()) } catch { throw new Error('URL Torznab invalide. Copiez l’URL API Torznab complète fournie par votre indexeur.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('L’URL Torznab doit commencer par http:// ou https://.')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  if (apiKey.trim() && !url.searchParams.has('apikey')) url.searchParams.set('apikey', apiKey.trim())
  return url
}

async function fetchTorznabXml(params: Record<string, string>, override?: { base?: string; apiKey?: string }) {
  const base = (override?.base ?? getSetting('TORZNAB_URL')).trim()
  const apiKey = override?.apiKey ?? getSetting('TORZNAB_API_KEY')
  if (!base) throw new Error('Aucun moteur Torznab n’est configuré. Renseignez son URL API dans les paramètres.')
  const url = buildTorznabUrl(base, apiKey, params)
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1', 'User-Agent': 'MoodFlix/0.1' },
      signal: AbortSignal.timeout(15000)
    })
  } catch (error: any) {
    if (error?.name === 'TimeoutError') throw new Error('Le moteur Torznab ne répond pas après 15 secondes.')
    throw new Error(`Connexion au moteur Torznab impossible : ${error?.message || 'erreur réseau'}`)
  }
  if (response.status === 401 || response.status === 403) throw new Error(`Clé Torznab refusée par le serveur (${response.status}). Vérifiez la clé et l’URL API.`)
  if (!response.ok) throw new Error(`Le moteur Torznab a répondu avec l’erreur HTTP ${response.status}.`)
  const xml = await response.text()
  if (/^\s*<!doctype html|^\s*<html/i.test(xml)) throw new Error('L’URL renvoie une page web au lieu d’un flux Torznab XML. Utilisez l’URL API Torznab, pas l’adresse du site.')
  let parsed: any
  try { parsed = await parseStringPromise(xml, { explicitArray: false }) }
  catch { throw new Error('La réponse du moteur n’est pas un document XML Torznab valide.') }
  const apiError = parsed?.error?.$ || parsed?.rss?.channel?.error?.$
  if (apiError) throw new Error(`Erreur Torznab ${apiError.code || ''} : ${apiError.description || 'requête refusée'}`.trim())
  return { parsed, base }
}

export async function testTorznab(base?: string, apiKey?: string) {
  const { parsed } = await fetchTorznabXml({ t: 'caps' }, { base, apiKey })
  if (!parsed?.caps) throw new Error('Le serveur a répondu, mais ce point d’entrée ne fournit pas les capacités Torznab attendues.')
  const categories = parsed.caps?.categories?.category
  const count = Array.isArray(categories) ? categories.length : categories ? 1 : 0
  return { ok: true, name: parsed.caps?.server?.$?.title || parsed.caps?.server?.$?.name || 'Moteur Torznab', categories: count }
}

function xmlText(value:any):string{
  if(Array.isArray(value))return value.map(xmlText).find(Boolean)||''
  if(typeof value==='string')return value.trim()
  if(value&&typeof value==='object')return xmlText(value._||value.$?.url||value.$?.value||'')
  return''
}

export function extractTorrentLink(item:any){
  const attrs=[...(['torznab:attr','newznab:attr'] as const).flatMap(key=>Array.isArray(item?.[key])?item[key]:[item?.[key]])].filter(Boolean)
  const attr=(name:string)=>xmlText(attrs.find((entry:any)=>String(entry?.$?.name||'').toLowerCase()===name)?.$?.value)
  const enclosures=(Array.isArray(item?.enclosure)?item.enclosure:[item?.enclosure]).filter(Boolean).map((entry:any)=>xmlText(entry?.$?.url||entry)).filter(Boolean)
  const valid=(value:string)=>/^(?:magnet:|https?:\/\/)/i.test(value)
  const preferred=[attr('magneturl'),attr('downloadurl'),...enclosures].find(value=>value&&valid(value))
  if(preferred)return preferred
  const infoHash=attr('infohash').replace(/[^a-z0-9]/gi,'')
  if(infoHash)return`magnet:?xt=urn:btih:${encodeURIComponent(infoHash)}&dn=${encodeURIComponent(xmlText(item?.title)||'MoodFlix')}`
  return [xmlText(item?.link),xmlText(item?.guid)].find(value=>value&&valid(value))||''
}

export async function searchTorznab(query: string, kind = 'all') {
  const category = kind === 'movie' ? '2000' : kind === 'series' ? '5000' : ''
  const params: Record<string, string> = { t: 'search', q: query.trim() }
  if (category) params.cat = category
  const { parsed, base } = await fetchTorznabXml(params)
  if (!parsed?.rss?.channel) throw new Error('La réponse ne contient pas de flux RSS Torznab. Vérifiez l’URL API configurée.')
  const raw = parsed?.rss?.channel?.item || []
  const items = Array.isArray(raw) ? raw : [raw]
  return items.map((item: any, index: number) => {
    const attrs = Array.isArray(item['torznab:attr']) ? item['torznab:attr'] : [item['torznab:attr']].filter(Boolean)
    const attr = (name: string) => attrs.find((a: any) => a?.$?.name === name)?.$?.value
    return {
      id: xmlText(item.guid) || `${index}`,
      title: xmlText(item.title),
      link: extractTorrentLink(item),
      size: Number(item.size || item.enclosure?.$?.length || 0),
      seeds: Number(attr('seeders') || 0),
      peers: Number(attr('peers') || 0),
      published: item.pubDate || null,
      source: item.jackettindexer?.$.id || new URL(base).hostname
    }
  }).filter((item:any)=>item.link).sort((a: any, b: any) => +new Date(b.published || 0) - +new Date(a.published || 0))
}
