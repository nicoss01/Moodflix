import { db, getSetting } from './db.js'
import { lookupOmdb, type MediaIdentity } from './omdb.js'

type MediaRow={id:number;title:string;kind:'movie'|'series';series_title:string|null;season:number|null;episode:number|null;year:number|null}

function ensureConfigured(){
  if(!getSetting('OMDB_API_KEY').trim())throw new Error('Renseignez une clé API OMDb dans les paramètres pour relancer l’enrichissement.')
}

function identityFromRow(row:MediaRow):MediaIdentity{
  return{title:row.title,kind:row.kind,seriesTitle:row.series_title,season:row.season,episode:row.episode,year:row.year}
}

export async function forceEnrichMedia(id:number){
  ensureConfigured()
  const row=db.prepare('SELECT id,title,kind,series_title,season,episode,year FROM media WHERE id=? AND path IS NOT NULL').get(id) as MediaRow|undefined
  if(!row)throw new Error('Média local introuvable.')
  const metadata=await lookupOmdb(identityFromRow(row),true)
  if(!metadata)throw new Error('OMDb n’a trouvé aucune information pour ce média.')
  db.prepare(`UPDATE media SET title=@title,series_title=COALESCE(@seriesTitle,series_title),year=COALESCE(@year,year),age_rating=@ageRating,
    genres=CASE WHEN @genres='[]' THEN genres ELSE @genres END,overview=CASE WHEN @overview='' THEN overview ELSE @overview END,
    poster=CASE WHEN @poster='' THEN poster ELSE @poster END WHERE id=@id`).run({id,...metadata,genres:JSON.stringify(metadata.genres)})
  return{id,title:metadata.title}
}

export async function forceEnrichSeries(title:string){
  ensureConfigured()
  const rows=db.prepare(`SELECT id,title,kind,series_title,season,episode,year FROM media
    WHERE kind='series' AND path IS NOT NULL AND COALESCE(series_title,title)=? COLLATE NOCASE`).all(title) as MediaRow[]
  if(!rows.length)throw new Error('Série locale introuvable.')
  const first=rows[0]
  const metadata=await lookupOmdb({title,kind:'series',seriesTitle:title,season:null,episode:null,year:first.year},true)
  if(!metadata)throw new Error('OMDb n’a trouvé aucune information pour cette série.')
  const officialTitle=metadata.title||title
  const result=db.prepare(`UPDATE media SET series_title=@officialTitle,year=COALESCE(@year,year),age_rating=@ageRating,
    genres=CASE WHEN @genres='[]' THEN genres ELSE @genres END,overview=CASE WHEN @overview='' THEN overview ELSE @overview END,
    poster=CASE WHEN @poster='' THEN poster ELSE @poster END
    WHERE kind='series' AND path IS NOT NULL AND COALESCE(series_title,title)=@currentTitle COLLATE NOCASE`).run({currentTitle:title,officialTitle,...metadata,genres:JSON.stringify(metadata.genres)})
  return{title:officialTitle,updated:result.changes}
}
