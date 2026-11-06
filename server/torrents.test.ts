import { describe, expect, it } from 'vitest'
import { buildTorznabUrl } from './torrents.js'

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
