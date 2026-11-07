import {afterEach,describe,expect,it,vi} from 'vitest'
import {isUiIdle,touchUiActivity} from './activity-state.js'

describe('état d’activité de l’interface',()=>{
  afterEach(()=>vi.useRealTimers())

  it('reporte les travaux de fond pendant les interactions récentes',()=>{
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    touchUiActivity()
    expect(isUiIdle()).toBe(false)
    vi.advanceTimersByTime(14_999)
    expect(isUiIdle()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(isUiIdle()).toBe(true)
  })
})
