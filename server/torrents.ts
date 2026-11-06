import { parseStringPromise } from 'xml2js'
import { getSetting } from './db.js'

let qbitCookie = ''

async function qbit(path: string, init: RequestInit = {}) {
  const base = getSetting('QBITTORRENT_URL', 'http://127.0.0.1:8080').replace(/\/$/, '')
  const headers = new Headers(init.headers)
  if (qbitCookie) headers.set('Cookie', qbitCookie)
  let response = await fetch(`${base}${path}`, { ...init, headers })
  if (response.status === 403 || response.status === 401 || (!qbitCookie && path !== '/api/v2/auth/login')) {
    const body = new URLSearchParams({ username: getSetting('QBITTORRENT_USER','admin'), password: getSetting('QBITTORRENT_PASSWORD','') })
    const login = await fetch(`${base}/api/v2/auth/login`, { method: 'POST', body })
    qbitCookie = login.headers.get('set-cookie')?.split(';')[0] || ''
    headers.set('Cookie', qbitCookie)
    response = await fetch(`${base}${path}`, { ...init, headers })
  }
  if (!response.ok) throw new Error(`qBittorrent: ${response.status}`)
  return response
}

export async function listTorrents() {
  const response = await qbit('/api/v2/torrents/info')
  return response.json()
}

export async function addTorrent(url: string) {
  const form = new FormData()
  form.set('urls', url)
  form.set('category', 'moodflix')
  form.set('savepath', getSetting('DOWNLOAD_DIR', '/srv/media/downloads'))
  await qbit('/api/v2/torrents/add', { method: 'POST', body: form })
}

export async function searchTorznab(query: string, kind = 'all') {
  const base = getSetting('TORZNAB_URL')
  const apiKey = getSetting('TORZNAB_API_KEY')
  if (!base) return []
  const category = kind === 'movie' ? '2000' : kind === 'series' ? '5000' : ''
  const url = new URL(base)
  url.searchParams.set('t', 'search')
  url.searchParams.set('q', query)
  if (category) url.searchParams.set('cat', category)
  if (apiKey) url.searchParams.set('apikey', apiKey)
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Moteur Torznab: ${response.status}`)
  const xml = await response.text()
  const parsed = await parseStringPromise(xml, { explicitArray: false })
  const raw = parsed?.rss?.channel?.item || []
  const items = Array.isArray(raw) ? raw : [raw]
  return items.map((item: any, index: number) => {
    const attrs = Array.isArray(item['torznab:attr']) ? item['torznab:attr'] : [item['torznab:attr']].filter(Boolean)
    const attr = (name: string) => attrs.find((a: any) => a?.$?.name === name)?.$?.value
    return {
      id: item.guid?._ || item.guid || `${index}`,
      title: item.title,
      link: item.link || item.enclosure?.$?.url,
      size: Number(item.size || item.enclosure?.$?.length || 0),
      seeds: Number(attr('seeders') || 0),
      peers: Number(attr('peers') || 0),
      published: item.pubDate || null,
      source: item.jackettindexer?.$.id || new URL(base).hostname
    }
  }).sort((a: any, b: any) => +new Date(b.published || 0) - +new Date(a.published || 0))
}
