import {describe,expect,it} from 'vitest'
import path from 'node:path'
import {completedMoodflixTorrents,contentPathHasAvailableMedia} from './torrent-importer.js'

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

describe('contentPathHasAvailableMedia',()=>{
  it('reconnaît un fichier ou un dossier de téléchargement déjà indexé',()=>{
    const root=path.resolve('downloads','Ma Serie')
    expect(contentPathHasAvailableMedia(root,[path.join(root,'S01E01.mkv')])).toBe(true)
    expect(contentPathHasAvailableMedia(path.join(root,'Film.mkv'),[path.join(root,'Film.mkv')])).toBe(true)
  })

  it('demande une réindexation lorsque les médias ne sont plus disponibles',()=>{
    expect(contentPathHasAvailableMedia(path.resolve('downloads','Film'),[path.resolve('downloads','Autre','video.mkv')])).toBe(false)
  })
})
