import {describe,expect,it} from 'vitest'
import {completedMoodflixTorrents} from './torrent-importer.js'

describe('completedMoodflixTorrents',()=>{
  it('ne conserve que les téléchargements MoodFlix terminés',()=>{
    const result=completedMoodflixTorrents([
      {hash:'done',name:'Film',progress:1,category:'moodflix'},
      {hash:'left-zero',name:'Série',progress:.99,amount_left:0,category:'moodflix'},
      {hash:'active',name:'Encore en cours',progress:.75,amount_left:10,category:'moodflix'},
      {hash:'other',name:'Autre client',progress:1,category:'archives'}
    ])
    expect(result.map(item=>item.hash)).toEqual(['done','left-zero'])
  })
})
