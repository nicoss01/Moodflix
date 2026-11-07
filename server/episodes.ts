export type EpisodeLink={id:number;title:string;season?:number;episode?:number}

export function findEpisodeNeighbors(episodes:EpisodeLink[],currentId:number){
  const index=episodes.findIndex(episode=>episode.id===currentId)
  return {previous:index>0?episodes[index-1]:null,next:index>=0&&index<episodes.length-1?episodes[index+1]:null}
}
