import { describe,expect,it } from 'vitest'
import { buildTaste,canonicalGenre,scoreGenres } from './recommendations.js'

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
})
