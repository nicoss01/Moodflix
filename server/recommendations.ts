import { db, getSetting } from './db.js'
import { createHash } from 'node:crypto'

export const GENRES = ['Action','Aventure','Animation','Comédie','Crime','Documentaire','Drame','Famille','Fantastique','Histoire','Horreur','Musique','Mystère','Romance','Science-fiction','Thriller','Guerre','Western'] as const

const aliases:Record<string,string> = {
  action:'Action', adventure:'Aventure', aventure:'Aventure', animation:'Animation', comedy:'Comédie', comedie:'Comédie',
  crime:'Crime', documentary:'Documentaire', documentaire:'Documentaire', drama:'Drame', drame:'Drame', family:'Famille', famille:'Famille',
  fantasy:'Fantastique', fantastique:'Fantastique', history:'Histoire', histoire:'Histoire', horror:'Horreur', horreur:'Horreur',
  music:'Musique', musique:'Musique', mystery:'Mystère', mystere:'Mystère', romance:'Romance',
  'science fiction':'Science-fiction', 'science-fiction':'Science-fiction', 'sci fi':'Science-fiction', thriller:'Thriller', war:'Guerre', guerre:'Guerre', western:'Western'
}

const movieGenres:Record<number,string> = {28:'Action',12:'Aventure',16:'Animation',35:'Comédie',80:'Crime',99:'Documentaire',18:'Drame',10751:'Famille',14:'Fantastique',36:'Histoire',27:'Horreur',10402:'Musique',9648:'Mystère',10749:'Romance',878:'Science-fiction',53:'Thriller',10752:'Guerre',37:'Western'}
const tvGenres:Record<number,string> = {...movieGenres,10759:'Action',10762:'Famille',10763:'Documentaire',10764:'Documentaire',10765:'Science-fiction',10766:'Drame',10767:'Comédie',10768:'Guerre'}

function clean(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}
export function canonicalGenre(value:string){return aliases[clean(value)] || GENRES.find(genre=>clean(genre)===clean(value)) || ''}

export type RatingTaste = { score:number; genres:string[] }
export function buildTaste(ratings:RatingTaste[], selected:string[]){
  const weights:Record<string,number> = {}
  for(const rating of ratings) for(const raw of rating.genres){const genre=canonicalGenre(raw);if(genre)weights[genre]=(weights[genre]||0)+(rating.score-3)}
  for(const raw of selected){const genre=canonicalGenre(raw);if(genre)weights[genre]=(weights[genre]||0)+3}
  return weights
}

export function scoreGenres(genres:string[], weights:Record<string,number>){return genres.reduce((total,raw)=>total+(weights[canonicalGenre(raw)]||0),0)}

type ProfileRow = {id:number;name:string;avatar:string;color:string;max_age:number;is_admin:number}
type MediaRow = {id:number;title:string;kind:'movie'|'series';year:number;duration:number;age_rating:number;genres:string;overview:string;poster?:string;backdrop?:string}
export type Recommendation = {id:string;title:string;kind:'movie'|'series';year:number;genres:string[];overview:string;poster?:string;backdrop?:string;age_rating:number;score:number;reason:string;available:boolean;localMediaId?:number;source:'library'|'tmdb'}

function profileOrThrow(profileId:number){
  if(!Number.isInteger(profileId))throw new Error('Profil invalide')
  const profile=db.prepare('SELECT * FROM profiles WHERE id=?').get(profileId) as ProfileRow|undefined
  if(!profile)throw new Error('Profil introuvable')
  return profile
}

function selectedGenres(profileId:number){return (db.prepare('SELECT genre FROM profile_genre_preferences WHERE profile_id=? ORDER BY genre').all(profileId) as {genre:string}[]).map(row=>row.genre)}
function ratingTastes(profileId:number){return (db.prepare('SELECT r.score,m.genres FROM ratings r JOIN media m ON m.id=r.media_id WHERE r.profile_id=?').all(profileId) as {score:number;genres:string}[]).map(row=>({score:row.score,genres:JSON.parse(row.genres||'[]')}))}

export function getProfilePreferences(profileId:number){
  const profile=profileOrThrow(profileId), selected=selectedGenres(profileId), weights=buildTaste(ratingTastes(profileId),selected)
  const inferredGenres=Object.entries(buildTaste(ratingTastes(profileId),[])).filter(([,weight])=>weight>0).sort((a,b)=>b[1]-a[1]).map(([genre])=>genre)
  return {profile,allGenres:[...GENRES],selectedGenres:selected,inferredGenres,weights}
}

export function saveProfilePreferences(profileId:number, genres:string[]){
  profileOrThrow(profileId)
  const normalized=[...new Set(genres.map(canonicalGenre).filter(Boolean))]
  db.transaction(()=>{db.prepare('DELETE FROM profile_genre_preferences WHERE profile_id=?').run(profileId);const insert=db.prepare('INSERT INTO profile_genre_preferences(profile_id,genre) VALUES(?,?)');for(const genre of normalized)insert.run(profileId,genre)})()
}

function reasonFor(genres:string[],weights:Record<string,number>){
  const match=genres.map(canonicalGenre).filter(Boolean).sort((a,b)=>(weights[b]||0)-(weights[a]||0))[0]
  return match&&weights[match]>0?`Parce que ${match.toLowerCase()} fait partie de vos goûts`:'Une découverte populaire qui respecte votre profil'
}

function localRecommendations(profile:ProfileRow,weights:Record<string,number>){
  const rated=new Map((db.prepare('SELECT media_id,score FROM ratings WHERE profile_id=?').all(profile.id) as {media_id:number;score:number}[]).map(row=>[row.media_id,row.score]))
  const rows=db.prepare('SELECT * FROM media WHERE available=1 AND age_rating<=?').all(profile.max_age) as MediaRow[]
  const unseen=rows.filter(row=>!rated.has(row.id)),pool=unseen.length?unseen:rows.filter(row=>(rated.get(row.id)||5)>2)
  return pool.map(row=>{const genres:string[]=JSON.parse(row.genres||'[]');return {id:`local:${row.id}`,title:row.title,kind:row.kind,year:row.year||0,genres,overview:row.overview,poster:row.poster,backdrop:row.backdrop,age_rating:row.age_rating,score:scoreGenres(genres,weights)+(row.year||0)/10000,reason:reasonFor(genres,weights),available:true,localMediaId:row.id,source:'library' as const}}).sort((a,b)=>b.score-a.score)
}

async function tmdbRequest(path:string,params:Record<string,string>,credential:string,ttl=6*60*60*1000){
  const cacheKey=`tmdb:${createHash('sha256').update(path+JSON.stringify(Object.entries(params).sort())).digest('hex')}`
  const cached=db.prepare('SELECT payload FROM metadata_cache WHERE cache_key=? AND expires_at>?').get(cacheKey,Date.now()) as {payload:string}|undefined
  if(cached)return JSON.parse(cached.payload)
  const url=new URL(`https://api.themoviedb.org/3${path}`);for(const [key,value] of Object.entries(params))if(value)url.searchParams.set(key,value)
  const headers:Record<string,string>={accept:'application/json'}
  if(credential.startsWith('eyJ'))headers.Authorization=`Bearer ${credential}`;else url.searchParams.set('api_key',credential)
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(12000)})
  if(!response.ok)throw new Error(`TMDB ne répond pas (${response.status})`)
  const payload=await response.json()
  db.prepare('INSERT INTO metadata_cache(cache_key,provider,payload,expires_at) VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP').run(cacheKey,'tmdb',JSON.stringify(payload),Date.now()+ttl)
  return payload
}

function certificationLimit(age:number){if(age<10)return'U';if(age<12)return'10';if(age<16)return'12';if(age<18)return'16';return'18'}
function tmdbItems(results:any[],kind:'movie'|'series',weights:Record<string,number>,maxAge:number):Recommendation[]{
  const names=kind==='movie'?movieGenres:tvGenres
  return results.filter(item=>!item.adult).map(item=>{const genres=(item.genre_ids||[]).map((id:number)=>names[id]).filter(Boolean);const title=kind==='movie'?item.title:item.name;const date=kind==='movie'?item.release_date:item.first_air_date;return {id:`tmdb:${kind}:${item.id}`,title,kind,year:Number(String(date||'').slice(0,4))||0,genres,overview:item.overview||'',poster:item.poster_path?`https://image.tmdb.org/t/p/w500${item.poster_path}`:undefined,backdrop:item.backdrop_path?`https://image.tmdb.org/t/p/w1280${item.backdrop_path}`:undefined,age_rating:maxAge,score:scoreGenres(genres,weights)+(Number(item.vote_average)||0)/5,reason:reasonFor(genres,weights),available:false,source:'tmdb' as const}})
}

async function tmdbRecommendations(profile:ProfileRow,weights:Record<string,number>,page=1){
  const credential=getSetting('TMDB_API_KEY').trim();if(!credential)return[]
  const wanted=Object.entries(weights).filter(([,weight])=>weight>0).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([genre])=>genre)
  const ids=(map:Record<number,string>)=>Object.entries(map).filter(([,genre])=>wanted.includes(genre)).map(([id])=>id).join('|')
  const common={language:'fr-FR',page:String(page),sort_by:'vote_average.desc','vote_count.gte':'80',include_adult:'false'}
  const calls=[tmdbRequest('/discover/movie',{...common,region:'FR',certification_country:'FR','certification.lte':certificationLimit(profile.max_age),with_genres:ids(movieGenres)},credential)]
  // La découverte TV ne renvoie pas de classification : elle reste réservée aux profils adultes.
  if(profile.max_age>=18)calls.push(tmdbRequest('/discover/tv',{...common,with_genres:ids(tvGenres)},credential))
  const settled=await Promise.allSettled(calls), items:Recommendation[]=[]
  if(settled[0].status==='fulfilled')items.push(...tmdbItems(settled[0].value.results||[],'movie',weights,profile.max_age))
  if(settled[1]?.status==='fulfilled')items.push(...tmdbItems(settled[1].value.results||[],'series',weights,profile.max_age))
  return items
}

export async function getRecommendationsForProfile(profileId:number,page=1){
  const profile=profileOrThrow(profileId), preferences=getProfilePreferences(profileId), local=localRecommendations(profile,preferences.weights)
  let remote:Recommendation[]=[];try{remote=await tmdbRecommendations(profile,preferences.weights,page)}catch{}
  const localTitles=new Set((db.prepare('SELECT title FROM media WHERE available=1').all() as {title:string}[]).map(item=>clean(item.title)))
  const remoteUnique=remote.filter(item=>!localTitles.has(clean(item.title))).sort((a,b)=>b.score-a.score)
  const remotePage=remoteUnique.slice(0,24),items=page===1?[...remotePage,...local.slice(0,6)].slice(0,24):remotePage
  return {profile,preferences:{selectedGenres:preferences.selectedGenres,inferredGenres:preferences.inferredGenres},source:remoteUnique.length?'tmdb':'library',items,page,hasMore:remoteUnique.length>=20&&page<10}
}

function ageFromCertification(value:string){
  const rating=value.toUpperCase().trim()
  if(!rating)return null
  if(['U','TP','G','TV-G','TV-Y'].includes(rating))return 3
  if(['7','TV-Y7','TV-Y7-FV'].includes(rating))return 7
  if(['10','PG','TV-PG'].includes(rating))return 10
  if(['12','PG-13','TV-14'].includes(rating))return 12
  if(['16','R','TV-MA'].includes(rating))return 16
  if(['18','NC-17'].includes(rating))return 18
  const numeric=Number(rating.match(/\d+/)?.[0]);return Number.isFinite(numeric)?numeric:null
}

async function tmdbItemAge(kind:'movie'|'series',id:number,credential:string){
  if(kind==='movie'){
    const data=await tmdbRequest(`/movie/${id}/release_dates`,{},credential,7*24*60*60*1000)
    const country=(data.results||[]).find((item:any)=>item.iso_3166_1==='FR')||(data.results||[]).find((item:any)=>item.iso_3166_1==='US')
    const ages=(country?.release_dates||[]).map((item:any)=>ageFromCertification(item.certification||'')).filter((age:any)=>age!==null)
    return ages.length?Math.max(...ages):null
  }
  const data=await tmdbRequest(`/tv/${id}/content_ratings`,{},credential,7*24*60*60*1000)
  const country=(data.results||[]).find((item:any)=>item.iso_3166_1==='FR')||(data.results||[]).find((item:any)=>item.iso_3166_1==='US')
  return ageFromCertification(country?.rating||'')
}

async function filterForAge(results:any[],kind:'movie'|'series',maxAge:number,credential:string){
  const candidates=results.filter(item=>!item.adult).slice(0,maxAge>=18?18:12)
  if(maxAge>=18)return candidates.map(item=>({...item,_age:18}))
  const checked=await Promise.all(candidates.map(async item=>{try{return {...item,_age:await tmdbItemAge(kind,item.id,credential)}}catch{return {...item,_age:null}}}))
  return checked.filter(item=>item._age!==null&&item._age<=maxAge)
}

export async function getTrending(kind:'movie'|'series',profileId?:number){
  const credential=getSetting('TMDB_API_KEY').trim();if(!credential)return[]
  const profile=profileId?profileOrThrow(profileId):null,maxAge=profile?.max_age||18,type=kind==='series'?'tv':'movie'
  const data=await tmdbRequest(`/trending/${type}/week`,{language:'fr-FR'},credential,3*60*60*1000)
  const released=onlyReleased(data.results||[],kind)
  const filtered=await filterForAge(released,kind,maxAge,credential)
  return tmdbItems(filtered,kind,{},maxAge).map((item,index)=>({...item,age_rating:filtered[index]?._age??maxAge,reason:kind==='movie'?'Parmi les films tendance cette semaine':'Parmi les séries tendance cette semaine'}))
}

export function onlyReleased(results:any[],kind:'movie'|'series',today=new Date().toISOString().slice(0,10)){
  const field=kind==='movie'?'release_date':'first_air_date'
  return results.filter(item=>typeof item?.[field]==='string'&&item[field]&&item[field]<=today)
}

export async function getRelated(input:{kind:'movie'|'series';tmdbId?:number;title?:string;year?:number;profileId?:number}){
  const credential=getSetting('TMDB_API_KEY').trim();if(!credential)return[]
  const profile=input.profileId?profileOrThrow(input.profileId):null,maxAge=profile?.max_age||18,type=input.kind==='series'?'tv':'movie'
  let id=input.tmdbId
  if(!id&&input.title){
    const params:Record<string,string>={query:input.title,language:'fr-FR'}
    if(input.year)params[input.kind==='movie'?'year':'first_air_date_year']=String(input.year)
    const found=await tmdbRequest(`/search/${type}`,params,credential,7*24*60*60*1000);id=found.results?.[0]?.id
  }
  if(!id)return[]
  const [recommended,similar]=await Promise.allSettled([tmdbRequest(`/${type}/${id}/recommendations`,{language:'fr-FR'},credential),tmdbRequest(`/${type}/${id}/similar`,{language:'fr-FR'},credential)])
  const combined=[...(recommended.status==='fulfilled'?recommended.value.results||[]:[]),...(similar.status==='fulfilled'?similar.value.results||[]:[])]
  const unique=[...new Map(combined.filter((item:any)=>item.id!==id).map((item:any)=>[item.id,item])).values()]
  const filtered=await filterForAge(unique,input.kind,maxAge,credential)
  return tmdbItems(filtered,input.kind,{},maxAge).map((item,index)=>({...item,age_rating:filtered[index]?._age??maxAge,reason:'Recommandé parce que vous consultez un titre similaire'})).slice(0,12)
}
