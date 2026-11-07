import { describe, expect, it } from 'vitest'
import { buildQbitHeaders, buildTorznabUrl, resolveQbitBase } from './torrents.js'

describe('buildTorznabUrl', () => {
  it('conserve les paramètres de l’indexeur et ajoute la clé Torznab', () => {
    const url = buildTorznabUrl('https://indexer.test/api?extended=1', 'secret', { t: 'search', q: 'film test' })
    expect(url.searchParams.get('extended')).toBe('1')
    expect(url.searchParams.get('apikey')).toBe('secret')
    expect(url.searchParams.get('t')).toBe('search')
    expect(url.searchParams.get('q')).toBe('film test')
  })

  it('ne remplace pas une clé déjà incluse dans l’URL', () => {
    const url = buildTorznabUrl('https://indexer.test/api?apikey=dans-url', 'autre', { t: 'caps' })
    expect(url.searchParams.get('apikey')).toBe('dans-url')
  })
})

describe('resolveQbitBase',()=>{
  it('utilise le client local lorsque le réglage est vide',()=>{
    expect(resolveQbitBase('')).toBe('http://127.0.0.1:8080')
  })
  it('normalise une adresse configurée sans produire de chemin relatif',()=>{
    expect(resolveQbitBase(' http://192.168.1.20:8080/ ')).toBe('http://192.168.1.20:8080')
  })
  it('ajoute le Referer exact requis par la protection CSRF qBittorrent',()=>{
    const headers=buildQbitHeaders('http://127.0.0.1:8080','SID=abc')
    expect(headers.get('Referer')).toBe('http://127.0.0.1:8080/')
    expect(headers.get('Cookie')).toBe('SID=abc')
  })
})
