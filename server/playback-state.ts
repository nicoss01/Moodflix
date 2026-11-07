let activeStreams=0
let lastStreamActivity=0

export function touchPlayback(){lastStreamActivity=Date.now()}

export function beginPlaybackStream(){
  activeStreams++
  touchPlayback()
  let ended=false
  return()=>{
    if(ended)return
    ended=true
    activeStreams=Math.max(0,activeStreams-1)
    touchPlayback()
  }
}

export function isPlaybackActive(graceMs=30000){
  return activeStreams>0||Date.now()-lastStreamActivity<graceMs
}
