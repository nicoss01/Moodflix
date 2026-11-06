import { describe, expect, it } from 'vitest'
import { parseCommitLog } from './updater.js'

describe('parseCommitLog', () => {
  it('convertit la sortie git en commits affichables', () => {
    const result = parseCommitLog('abc123\x1fabc123\x1fNicolas\x1f2026-11-06T12:00:00+01:00\x1fAméliore le lecteur\x1e')
    expect(result).toEqual([{
      hash: 'abc123', shortHash: 'abc123', author: 'Nicolas',
      date: '2026-11-06T12:00:00+01:00', subject: 'Améliore le lecteur'
    }])
  })
})
