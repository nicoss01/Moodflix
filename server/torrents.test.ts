import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertQbitAddResponse, buildQbitHeaders, buildTorznabUrl, extractTorrentLink, resolveQbitBase, testQbit } from './torrents.js'

afterEach(()=>vi.restoreAllMocks())

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
  it('teste réellement les identifiants avant de lire la version',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch')
      .mockResolvedValueOnce(new Response('Ok.',{status:200,headers:{'set-cookie':'SID=session; HttpOnly'}}))
      .mockResolvedValueOnce(new Response('5.1.2',{status:200}))
    await expect(testQbit('http://127.0.0.1:8080','admin','secret')).resolves.toEqual({ok:true,version:'5.1.2'})
    const login=fetchMock.mock.calls[0]
    expect(login[0]).toBe('http://127.0.0.1:8080/api/v2/auth/login')
    expect(String(login[1]?.body)).toContain('password=secret')
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Cookie')).toBe('SID=session')
  })
})

describe('assertQbitAddResponse',()=>{
  it('accepte la confirmation qBittorrent',()=>{
    expect(()=>assertQbitAddResponse('Ok.')).not.toThrow()
  })
  it('refuse le faux succès HTTP 200 de qBittorrent',()=>{
    expect(()=>assertQbitAddResponse('Fails.')).toThrow(/refusé le torrent/)
  })
})

describe('extractTorrentLink',()=>{
  it('préfère le lien magnet Torznab à la page web du résultat',()=>{
    expect(extractTorrentLink({title:'Film',link:'https://indexeur.test/details/42','torznab:attr':[
      {$:{name:'seeders',value:'10'}},{$:{name:'magneturl',value:'magnet:?xt=urn:btih:ABC123'}}
    ]})).toBe('magnet:?xt=urn:btih:ABC123')
  })
  it('préfère enclosure à la page de détails',()=>{
    expect(extractTorrentLink({link:'https://indexeur.test/details/42',enclosure:{$:{url:'https://indexeur.test/download/42.torrent'}}})).toBe('https://indexeur.test/download/42.torrent')
  })
  it('reconstruit un magnet depuis infohash avant de reprendre link',()=>{
    expect(extractTorrentLink({title:'Ma série',link:'https://indexeur.test/details/42','torznab:attr':{$:{name:'infohash',value:'0123456789ABCDEF'}}})).toContain('magnet:?xt=urn:btih:0123456789ABCDEF')
  })
})
