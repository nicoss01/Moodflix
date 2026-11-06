import { getSetting } from './db.js'

export type MediaIdentity = {
  title: string
  kind: 'movie'|'series'
  seriesTitle: string|null
  season: number|null
  episode: number|null
  year: number|null
}

type OmdbResponse = {
  Title?: string
  Year?: string
  Rated?: string
  Genre?: string
  Plot?: string
  Poster?: string
  Type?: string
  Response?: string
  Error?: string
}

export function ageFromOmdb(rated?: string) {
  const value = (rated || '').toUpperCase()
  if (['G','TV-G','TV-Y'].includes(value)) return 3
  if (['TV-Y7','TV-Y7-FV'].includes(value)) return 7
  if (['PG','TV-PG'].includes(value)) return 10
  if (['PG-13','TV-14'].includes(value)) return 12
  if (['R','TV-MA'].includes(value)) return 16
  return 18
}

const useful = (value?: string) => value && value !== 'N/A' ? value : ''

export function mapOmdbMetadata(data: OmdbResponse, identity: MediaIdentity) {
  const omdbTitle = useful(data.Title)
  const episodeLabel = identity.kind === 'series' && identity.season && identity.episode
    ? `${identity.seriesTitle || identity.title} — S${String(identity.season).padStart(2,'0')} E${String(identity.episode).padStart(2,'0')}${omdbTitle ? ` · ${omdbTitle}` : ''}`
    : omdbTitle || identity.title
  const year = Number(useful(data.Year)?.match(/\d{4}/)?.[0] || identity.year || 0) || null
  const poster = useful(data.Poster).replace(/^http:/, 'https:')
  return {
    title: episodeLabel,
    seriesTitle: identity.seriesTitle,
    year,
    ageRating: ageFromOmdb(data.Rated),
    genres: useful(data.Genre).split(',').map(value => value.trim()).filter(Boolean),
    overview: useful(data.Plot),
    poster
  }
}

async function requestOmdb(params: Record<string,string>, apiKey: string) {
  const url = new URL('https://www.omdbapi.com/')
  url.searchParams.set('apikey', apiKey)
  url.searchParams.set('r', 'json')
  url.searchParams.set('plot', 'full')
  for (const [key,value] of Object.entries(params)) if (value) url.searchParams.set(key,value)
  let response: Response
  try { response = await fetch(url, { signal: AbortSignal.timeout(10000) }) }
  catch (error: any) {
    console.warn(`OMDb indisponible : ${error?.message || 'erreur réseau'}`)
    return null
  }
  if (!response.ok) { console.warn(`OMDb : erreur HTTP ${response.status}`); return null }
  const data = await response.json() as OmdbResponse
  if (data.Response === 'False') return null
  return data
}

export async function lookupOmdb(identity: MediaIdentity) {
  const apiKey = getSetting('OMDB_API_KEY').trim()
  if (!apiKey) return null
  const params: Record<string,string> = {
    t: identity.kind === 'series' ? identity.seriesTitle || identity.title : identity.title,
    type: identity.kind === 'series' ? 'episode' : 'movie'
  }
  if (identity.year && identity.kind === 'movie') params.y = String(identity.year)
  if (identity.kind === 'series' && identity.season && identity.episode) {
    params.Season = String(identity.season)
    params.Episode = String(identity.episode)
  }
  let data = await requestOmdb(params, apiKey)
  if (!data && identity.kind === 'series') data = await requestOmdb({ t: identity.seriesTitle || identity.title, type: 'series' }, apiKey)
  return data ? mapOmdbMetadata(data, identity) : null
}

export async function testOmdb(apiKey: string) {
  const key = apiKey.trim()
  if (!key) throw new Error('Renseignez une clé API OMDb avant de lancer le test.')
  const url = new URL('https://www.omdbapi.com/')
  url.searchParams.set('apikey', key)
  url.searchParams.set('i', 'tt0133093')
  url.searchParams.set('r', 'json')
  let response: Response
  try { response = await fetch(url, { signal: AbortSignal.timeout(10000) }) }
  catch { throw new Error('Connexion à OMDb impossible ou délai dépassé.') }
  if (!response.ok) throw new Error(`OMDb a répondu avec l’erreur HTTP ${response.status}.`)
  const data = await response.json() as OmdbResponse
  if (data.Response === 'False') throw new Error(`OMDb : ${data.Error || 'clé refusée'}`)
  return { ok:true, title:data.Title || 'The Matrix', poster:Boolean(useful(data.Poster)) }
}
