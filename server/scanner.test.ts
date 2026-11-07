import { describe, expect, it } from 'vitest'
import { isVideoCandidate, parseLsblk, parseMediaName } from './scanner.js'

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
  it('détecte une partition USB montée et ignore le disque système',()=>{
    const drives=parseLsblk({blockdevices:[
      {path:'/dev/mmcblk0',type:'disk',rm:0,children:[{path:'/dev/mmcblk0p2',type:'part',fstype:'ext4',mountpoints:['/']}]},
      {path:'/dev/sda',type:'disk',tran:'usb',rm:1,model:'Portable',size:1000,children:[{path:'/dev/sda1',type:'part',rm:0,fstype:'exfat',label:'FILMS',size:900,mountpoints:['/media/nico/FILMS']}]}
    ]})
    expect(drives).toEqual([expect.objectContaining({device:'/dev/sda1',name:'FILMS',mountpoint:'/media/nico/FILMS',mounted:true,fileSystem:'exfat'})])
  })
})

describe('isVideoCandidate',()=>{
  it('accepte les conteneurs vidéo et rejette les déclarations TypeScript',()=>{
    expect(isVideoCandidate('Film.2026.mkv')).toBe(true)
    expect(isVideoCandidate('enregistrement.ts')).toBe(true)
    expect(isVideoCandidate('error.d.ts')).toBe(false)
    expect(isVideoCandidate('affiche.jpg')).toBe(false)
  })
})
