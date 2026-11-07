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
  it('reconnaît les variantes de nommage et les dossiers de saison',()=>{
    expect(parseMediaName('/media/The Bear/The.Bear.2x03.1080p.mkv')).toMatchObject({seriesTitle:'The Bear',kind:'series',season:2,episode:3})
    expect(parseMediaName('/media/Severance/Season 02/03 - Who Is Alive.mp4')).toMatchObject({seriesTitle:'Severance',kind:'series',season:2,episode:3})
    expect(parseMediaName('/media/Severance/Season 02/Severance - E04 - Woe.mkv')).toMatchObject({seriesTitle:'Severance',kind:'series',season:2,episode:4})
    expect(parseMediaName('/media/OVNI/Saison.01/Episode 04.mkv')).toMatchObject({seriesTitle:'OVNI',kind:'series',season:1,episode:4})
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
  it('accepte les conteneurs vidéo et rejette tous les fichiers .ts',()=>{
    expect(isVideoCandidate('Film.2026.mkv')).toBe(true)
    expect(isVideoCandidate('enregistrement.ts')).toBe(false)
    expect(isVideoCandidate('error.d.ts')).toBe(false)
    expect(isVideoCandidate('affiche.jpg')).toBe(false)
  })
})
