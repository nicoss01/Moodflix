import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

export const remoteEvents = new EventEmitter()
let client: ChildProcessWithoutNullStreams | null = null
let restartTimer: NodeJS.Timeout | null = null

const keyMap: Array<[RegExp, string]> = [
  [/key pressed: left/i, 'ArrowLeft'],
  [/key pressed: right/i, 'ArrowRight'],
  [/key pressed: up/i, 'ArrowUp'],
  [/key pressed: down/i, 'ArrowDown'],
  [/key pressed: select/i, 'Enter'],
  [/key pressed: (exit|previous channel|root menu)/i, 'Backspace'],
  [/key pressed: (play|pause|play pause)/i, 'MediaPlayPause'],
  [/key pressed: stop/i, 'Escape']
]

export function startCecBridge() {
  if (process.platform !== 'linux' || process.env.ENABLE_CEC === 'false' || client) return
  try {
    client = spawn('cec-client', ['-d', '8', '-t', 'p'], { stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (error) {
    console.warn('CEC indisponible :', error)
    return
  }
  let buffer = ''
  const consume = (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    for (const line of lines) {
      const match = keyMap.find(([pattern]) => pattern.test(line))
      if (match) remoteEvents.emit('key', match[1])
    }
  }
  client.stdout.on('data', consume)
  client.stderr.on('data', consume)
  client.on('error', error => console.warn('Pont HDMI-CEC :', error.message))
  client.on('exit', () => {
    client = null
    if (restartTimer) clearTimeout(restartTimer)
    restartTimer = setTimeout(startCecBridge, 5000)
  })
  client.stdin.write('scan\n')
  console.log('Pont HDMI-CEC actif')
}
