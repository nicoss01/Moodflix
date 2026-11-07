import { describe,expect,it } from 'vitest'
import { findEpisodeNeighbors } from './episodes.js'

describe('navigation entre épisodes',()=>{
  const episodes=[{id:1,title:'S01E01'},{id:2,title:'S01E02'},{id:3,title:'S02E01'}]
  it('retourne les épisodes précédent et suivant',()=>expect(findEpisodeNeighbors(episodes,2)).toEqual({previous:episodes[0],next:episodes[2]}))
  it('cache les commandes absentes aux extrémités',()=>{
    expect(findEpisodeNeighbors(episodes,1).previous).toBeNull()
    expect(findEpisodeNeighbors(episodes,3).next).toBeNull()
  })
})
