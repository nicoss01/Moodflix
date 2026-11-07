export type Profile = { id:number; name:string; avatar:string; color:string; max_age:number; is_admin:number }
export type Media = { id:number; title:string; kind:'movie'|'series'; series_title?:string; season?:number; episode?:number; year:number; duration:number; age_rating:number; genres:string[]; overview:string; poster?:string; backdrop?:string; path?:string; position?:number; completed?:boolean }
export type EpisodeLink = { id:number; title:string; season?:number; episode?:number }
export type SeriesGroup = { id:string; title:string; year:number; age_rating:number; genres:string[]; overview:string; poster?:string; backdrop?:string; seasons:number[]; episodes:Media[] }
export type Recommendation = { id:string; title:string; kind:'movie'|'series'; year:number; genres:string[]; overview:string; poster?:string; backdrop?:string; age_rating:number; score:number; reason:string; available:boolean; localMediaId?:number; source:'library'|'tmdb' }
export type ProfilePreferences = { profile:Profile; allGenres:string[]; selectedGenres:string[]; inferredGenres:string[]; weights:Record<string,number> }
export type TorrentResult = { id:string; title:string; link:string; size:number; seeds:number; peers:number; published?:string; source:string }
export type TorznabTestResult = { ok:boolean; name:string; categories:number }
export type OmdbTestResult = { ok:boolean; title:string; poster:boolean }
export type QbitTestResult = { ok:boolean; version:string }
export type UpdateStatus = { available:boolean; branch:string; localCommit:string; remoteCommit:string; checkedAt:string; commits:Array<{hash:string;shortHash:string;author:string;date:string;subject:string}> }
export type DriveInfo = { id:string;device:string;name:string;label:string;model:string;size:number;fileSystem:string;mountpoint:string;mounted:boolean }
export type DriveScan = { id:string;device:string;status:'waiting'|'running'|'complete'|'error';phase:'mounting'|'discovering'|'scanning'|'complete';current:number;total:number;percent:number;found:number;enriched:number;recent:Array<{title:string;kind:'movie'|'series';poster?:string}>;error?:string }

async function request<T>(path:string, init?:RequestInit):Promise<T> {
  const response = await fetch(`/api${path}`, { headers: { 'Content-Type':'application/json', ...init?.headers }, ...init })
  if (!response.ok) { const body = await response.json().catch(()=>({})); throw new Error(body.error || `Erreur ${response.status}`) }
  return response.json()
}

export const api = {
  profiles: () => request<Profile[]>('/profiles'),
  createProfile: (body:Partial<Profile>) => request<Profile>('/profiles', { method:'POST', body:JSON.stringify(body) }),
  updateProfile: (id:number, body:Partial<Profile>) => request<Profile>(`/profiles/${id}`, { method:'PUT', body:JSON.stringify(body) }),
  deleteProfile: (id:number) => request(`/profiles/${id}`, { method:'DELETE' }),
  media: (kind?:string,profileId?:number) => { const query=new URLSearchParams();if(kind)query.set('kind',kind);if(profileId)query.set('profileId',String(profileId));return request<Media[]>(`/media${query.size?`?${query}`:''}`) },
  series: (profileId?:number) => request<SeriesGroup[]>(`/series${profileId?`?profileId=${profileId}`:''}`),
  mediaById: (id:string) => request<Media>(`/media/${id}`),
  setMediaHidden: (id:number,hidden=true) => request<{ok:boolean;hidden:boolean}>(`/media/${id}/visibility`, { method:'PUT', body:JSON.stringify({hidden}) }),
  deleteMediaFile: (id:number) => request<{ok:boolean}>(`/media/${id}/file`, { method:'DELETE', body:JSON.stringify({confirm:true}) }),
  setSeriesHidden: (title:string,hidden=true) => request<{ok:boolean;hidden:boolean;count:number}>('/series/visibility', { method:'PUT', body:JSON.stringify({title,hidden}) }),
  deleteSeriesFiles: (title:string) => request<{ok:boolean;count:number}>('/series/files', { method:'DELETE', body:JSON.stringify({title,confirm:true}) }),
  episodeNeighbors: (id:string) => request<{previous:EpisodeLink|null;next:EpisodeLink|null}>(`/media/${id}/neighbors`),
  scan: () => request<{found:number;directories:string[];enriched:number}>('/library/scan', { method:'POST' }),
  drives: () => request<DriveInfo[]>('/library/drives'),
  startDriveScan: (device:string) => request<DriveScan>('/library/drives/scan', { method:'POST', body:JSON.stringify({device}) }),
  driveScan: (id:string) => request<DriveScan>(`/library/drives/scan/${id}`),
  recommend: (body:object) => request<{ageLimit:number;items:Media[]}>('/recommendations', { method:'POST', body:JSON.stringify(body) }),
  profileRecommendations: (profileId:number,page=1) => request<{profile:Profile;preferences:{selectedGenres:string[];inferredGenres:string[]};source:'tmdb'|'library';items:Recommendation[];page:number;hasMore:boolean}>(`/recommendations/profile/${profileId}?page=${page}`),
  profilePreferences: (profileId:number) => request<ProfilePreferences>(`/profiles/${profileId}/preferences`),
  saveProfilePreferences: (profileId:number,genres:string[]) => request<ProfilePreferences>(`/profiles/${profileId}/preferences`, { method:'PUT', body:JSON.stringify({genres}) }),
  recommendationPreferencesQr: (profileId:number) => request<{url:string;qr:string}>(`/recommendations/preferences/qr?profileId=${profileId}`),
  trending: (kind:'movie'|'series',profileId?:number) => request<Recommendation[]>(`/catalog/trending?kind=${kind}${profileId?`&profileId=${profileId}`:''}`),
  related: (item:Recommendation,profileId?:number) => { const parts=item.id.split(':'); const tmdbId=parts[0]==='tmdb'?parts[2]:''; return request<Recommendation[]>(`/catalog/related?kind=${item.kind}&title=${encodeURIComponent(item.title)}&year=${item.year||''}${tmdbId?`&tmdbId=${tmdbId}`:''}${profileId?`&profileId=${profileId}`:''}`) },
  rate: (profileId:number, mediaId:number, score:number) => request(`/profiles/${profileId}/rating`, { method:'PUT', body:JSON.stringify({mediaId,score}) }),
  saveProgress: (body:object) => request('/progress', { method:'PUT', body:JSON.stringify(body) }),
  continueWatching: (profileId:number) => request<Media[]>(`/progress/continue?profileId=${profileId}`),
  progress: (profileId:number,mediaId:number) => request<{position:number;completed:boolean}>(`/progress/${mediaId}?profileId=${profileId}`),
  torrentSearch: (q:string,kind:string) => request<TorrentResult[]>(`/torrents/search?q=${encodeURIComponent(q)}&kind=${kind}`),
  torrentSearchQr: () => request<{url:string;qr:string}>('/torrents/search/qr'),
  sendTorrentSearch: (query:string,kind:string) => request<{ok:boolean}>('/torrents/search/remote', { method:'POST', body:JSON.stringify({query,kind}) }),
  torrents: () => request<any[]>('/torrents'),
  addTorrent: (url:string) => request<{ok:boolean;duplicate:boolean;torrent:{hash:string;name:string;progress:number;state:string}}>('/torrents', { method:'POST', body:JSON.stringify({url}) }),
  qr: () => request<{url:string;qr:string}>('/setup/qr'),
  onboarding: () => request<{complete:boolean}>('/onboarding'),
  completeOnboarding: () => request<{complete:boolean}>('/onboarding/complete', { method:'POST' }),
  settings: () => request<Record<string,string>>('/settings'),
  saveSettings: (settings:Record<string,string>) => request('/settings', { method:'PUT', body:JSON.stringify(settings) }),
  testTorznab: (url:string,apiKey:string) => request<TorznabTestResult>('/settings/torznab/test', { method:'POST', body:JSON.stringify({url,apiKey}) }),
  testOmdb: (apiKey:string) => request<OmdbTestResult>('/settings/omdb/test', { method:'POST', body:JSON.stringify({apiKey}) }),
  testQbit: (url:string,username:string,password:string) => request<QbitTestResult>('/settings/qbittorrent/test', { method:'POST', body:JSON.stringify({url,username,password}) }),
  checkUpdate: () => request<UpdateStatus>('/update/check'),
  applyUpdate: () => request<{ok:boolean;status:UpdateStatus;restarting:boolean}>('/update/apply', { method:'POST', body:JSON.stringify({confirm:true}) }),
  restartSystem: () => request<{ok:boolean}>('/system/reboot', { method:'POST', body:JSON.stringify({confirm:'RESTART'}) })
}
