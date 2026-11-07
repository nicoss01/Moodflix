import { describe,expect,it } from 'vitest'
import { hasBeenWatched } from './progress.js'

describe('progression de lecture',()=>{
  it('marque un média comme vu à partir de 95 %',()=>{
    expect(hasBeenWatched(949,1000)).toBe(false)
    expect(hasBeenWatched(950,1000)).toBe(true)
    expect(hasBeenWatched(0,0,true)).toBe(true)
  })
})
