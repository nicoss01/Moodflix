import { describe,expect,it } from 'vitest'
import { buildTaste,canonicalGenre,onlyReleased,scoreGenres } from './recommendations.js'

describe('moteur de recommandations',()=>{
  it('réunit les noms de genres français et anglais',()=>{
    expect(canonicalGenre('Science Fiction')).toBe('Science-fiction')
    expect(canonicalGenre('Comédie')).toBe('Comédie')
  })
  it('combine les notes et les préférences manuelles',()=>{
    const taste=buildTaste([{score:5,genres:['Adventure','Drama']},{score:1,genres:['Horror']}],['Science-fiction'])
    expect(taste).toMatchObject({Aventure:2,Drame:2,Horreur:-2,'Science-fiction':3})
    expect(scoreGenres(['Science Fiction','Adventure'],taste)).toBe(5)
  })
  it('exclut les tendances qui ne sont pas encore sorties',()=>{
    const items=[{id:1,release_date:'2026-11-06'},{id:2,release_date:'2026-11-07'},{id:3,release_date:'2026-11-08'},{id:4,release_date:''}]
    expect(onlyReleased(items,'movie','2026-11-07').map(item=>item.id)).toEqual([1,2])
  })
})
