import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { isVideoCandidate, parseLsblk, parseMediaName, unavailableMediaIds, uniqueScanDirectories } from './scanner.js'

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

describe('uniqueScanDirectories',()=>{
  it('inclut le dossier de téléchargement sans rescanner un sous-dossier déjà couvert',()=>{
    const media=path.resolve('srv','media'),downloads=path.join(media,'downloads'),usb=path.resolve('media','usb')
    expect(uniqueScanDirectories([media,downloads,usb,media])).toEqual([media,usb])
  })
})

describe('unavailableMediaIds',()=>{
  it('conserve les fichiers trouvés jusqu’à la réconciliation finale',()=>{
    const root=path.resolve('media','usb'),present=path.join(root,'Series','episode.mkv'),missing=path.join(root,'Film.mkv')
    expect(unavailableMediaIds([{id:1,path:present},{id:2,path:missing}], [root], [present], true)).toEqual([2])
  })

  it('ne modifie pas les médias situés hors d’une analyse partielle',()=>{
    const root=path.resolve('downloads'),outside=path.resolve('media','usb','Film.mkv')
    expect(unavailableMediaIds([{id:1,path:outside}], [root], [], false)).toEqual([])
  })
})
