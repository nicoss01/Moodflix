let lastUiActivity=Date.now()

export function touchUiActivity(){lastUiActivity=Date.now()}

export function isUiIdle(minimumIdleMs=15000){
  return Date.now()-lastUiActivity>=minimumIdleMs
}
