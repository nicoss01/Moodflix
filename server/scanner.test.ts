import { describe, expect, it } from 'vitest'
import { parseMediaName } from './scanner.js'

describe('parseMediaName', () => {
  it('reconnaît les films et leur année', () => {
    expect(parseMediaName('/media/Dune.Part.Two.2024.2160p.mkv')).toMatchObject({
      title: 'Dune Part Two', kind: 'movie', year: 2024
    })
  })

  it('reconnaît les épisodes', () => {
    expect(parseMediaName('/media/Cosmos.9.S02E04.1080p.mkv')).toMatchObject({
      seriesTitle: 'Cosmos 9', kind: 'series', season: 2, episode: 4
    })
  })
})
