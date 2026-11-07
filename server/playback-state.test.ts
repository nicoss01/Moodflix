import {afterEach,describe,expect,it,vi} from 'vitest'
import {beginPlaybackStream,isPlaybackActive} from './playback-state.js'

describe('playback activity',()=>{
  afterEach(()=>vi.useRealTimers())
  it('protège la lecture puis libère les tâches de fond après le délai de grâce',()=>{
    vi.useFakeTimers();vi.setSystemTime(100000)
    const end=beginPlaybackStream()
    expect(isPlaybackActive()).toBe(true)
    end();vi.advanceTimersByTime(29999)
    expect(isPlaybackActive()).toBe(true)
    vi.advanceTimersByTime(2)
    expect(isPlaybackActive()).toBe(false)
  })
})
