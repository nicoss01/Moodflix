export type Profile = { id:number; name:string; avatar:string; color:string; max_age:number; is_admin:number }
export type Media = { id:number; title:string; kind:'movie'|'series'; series_title?:string; season?:number; episode?:number; year:number; duration:number; age_rating:number; genres:string[]; overview:string; poster?:string; backdrop?:string; path?:string; position?:number }
export type TorrentResult = { id:string; title:string; link:string; size:number; seeds:number; peers:number; published?:string; source:string }
export type TorznabTestResult = { ok:boolean; name:string; categories:number }
export type OmdbTestResult = { ok:boolean; title:string; poster:boolean }
export type UpdateStatus = { available:boolean; branch:string; localCommit:string; remoteCommit:string; checkedAt:string; commits:Array<{hash:string;shortHash:string;author:string;date:string;subject:string}> }

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
  media: (kind?:string) => request<Media[]>(`/media${kind ? `?kind=${kind}` : ''}`),
  mediaById: (id:string) => request<Media>(`/media/${id}`),
  scan: () => request<{found:number;directories:string[];enriched:number}>('/library/scan', { method:'POST' }),
  recommend: (body:object) => request<{ageLimit:number;items:Media[]}>('/recommendations', { method:'POST', body:JSON.stringify(body) }),
  rate: (profileId:number, mediaId:number, score:number) => request(`/profiles/${profileId}/rating`, { method:'PUT', body:JSON.stringify({mediaId,score}) }),
  saveProgress: (body:object) => request('/progress', { method:'PUT', body:JSON.stringify(body) }),
  continueWatching: (profileId:number) => request<Media[]>(`/progress/continue?profileId=${profileId}`),
  progress: (profileId:number,mediaId:number) => request<{position:number;completed:boolean}>(`/progress/${mediaId}?profileId=${profileId}`),
  torrentSearch: (q:string,kind:string) => request<TorrentResult[]>(`/torrents/search?q=${encodeURIComponent(q)}&kind=${kind}`),
  torrentSearchQr: () => request<{url:string;qr:string}>('/torrents/search/qr'),
  sendTorrentSearch: (query:string,kind:string) => request<{ok:boolean}>('/torrents/search/remote', { method:'POST', body:JSON.stringify({query,kind}) }),
  torrents: () => request<any[]>('/torrents'),
  addTorrent: (url:string) => request('/torrents', { method:'POST', body:JSON.stringify({url}) }),
  qr: () => request<{url:string;qr:string}>('/setup/qr'),
  onboarding: () => request<{complete:boolean}>('/onboarding'),
  completeOnboarding: () => request<{complete:boolean}>('/onboarding/complete', { method:'POST' }),
  settings: () => request<Record<string,string>>('/settings'),
  saveSettings: (settings:Record<string,string>) => request('/settings', { method:'PUT', body:JSON.stringify(settings) }),
  testTorznab: (url:string,apiKey:string) => request<TorznabTestResult>('/settings/torznab/test', { method:'POST', body:JSON.stringify({url,apiKey}) }),
  testOmdb: (apiKey:string) => request<OmdbTestResult>('/settings/omdb/test', { method:'POST', body:JSON.stringify({apiKey}) }),
  checkUpdate: () => request<UpdateStatus>('/update/check'),
  applyUpdate: () => request<{ok:boolean;status:UpdateStatus;restarting:boolean}>('/update/apply', { method:'POST', body:JSON.stringify({confirm:true}) })
}
