export const WATCHED_RATIO = 0.95

export function hasBeenWatched(position:number,duration:number,completed=false){
  return completed||(duration>0&&position/duration>=WATCHED_RATIO)
}
