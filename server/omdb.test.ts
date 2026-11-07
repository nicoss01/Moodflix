import { describe, expect, it } from 'vitest'
import { ageFromOmdb, mapOmdbMetadata, normalizeOmdbTitle } from './omdb.js'

describe('métadonnées OMDb', () => {
  it('convertit les classifications en limite d’âge MoodFlix', () => {
    expect(ageFromOmdb('PG-13')).toBe(12)
    expect(ageFromOmdb('TV-MA')).toBe(16)
    expect(ageFromOmdb('N/A')).toBe(18)
  })

  it('prépare le résumé, les genres et une affiche HTTPS', () => {
    const metadata = mapOmdbMetadata({ Title:'Dune: Part Two',Year:'2024',Rated:'PG-13',Genre:'Action, Adventure',Plot:'Résumé',Poster:'http://img.test/poster.jpg' }, { title:'Dune Part Two',kind:'movie',seriesTitle:null,season:null,episode:null,year:2024 })
    expect(metadata).toMatchObject({ title:'Dune: Part Two',year:2024,ageRating:12,genres:['Action','Adventure'],overview:'Résumé',poster:'https://img.test/poster.jpg' })
  })

  it('rapproche les titres malgré les apostrophes, accents et ponctuations',()=>{
    expect(normalizeOmdbTitle("Grey's Anatomy")).toBe(normalizeOmdbTitle('Greys anatomy'))
    expect(normalizeOmdbTitle('L’Été meurtrier')).toBe(normalizeOmdbTitle('Lete meurtrier'))
  })
})
