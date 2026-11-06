import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

export const remoteEvents = new EventEmitter()
let client: ChildProcessWithoutNullStreams | null = null
let restartTimer: NodeJS.Timeout | null = null
let lastKey = ''
let lastKeyAt = 0

const keyMap: Array<[RegExp, string]> = [
  [/key pressed: left/i, 'ArrowLeft'],
  [/key pressed: right/i, 'ArrowRight'],
  [/key pressed: up/i, 'ArrowUp'],
  [/key pressed: down/i, 'ArrowDown'],
  [/key pressed: (select|enter)/i, 'Enter'],
  [/key pressed: (exit|back|previous channel|root menu)/i, 'Backspace'],
  [/key pressed: (play|pause|play pause|play function|pause play function)/i, 'MediaPlayPause'],
  [/key pressed: stop/i, 'Escape']
]

const opcodeMap: Record<string, string> = {
  '00': 'Enter', '01': 'ArrowUp', '02': 'ArrowDown', '03': 'ArrowLeft', '04': 'ArrowRight',
  '09': 'Backspace', '0d': 'Backspace', '44': 'MediaPlayPause', '45': 'Escape', '46': 'MediaPlayPause'
}

function emitKey(key: string) {
  const now = Date.now()
  if (key === lastKey && now - lastKeyAt < 120) return
  lastKey = key
  lastKeyAt = now
  remoteEvents.emit('key', key)
  console.log(`HDMI-CEC : ${key}`)
}

export function startCecBridge() {
  if (process.platform !== 'linux' || process.env.ENABLE_CEC === 'false' || client) return
  try {
    client = spawn('cec-client', ['-d', '8', '-t', 'p', '-o', 'MoodFlix'], { stdio: ['pipe', 'pipe', 'pipe'] })
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
      if (match) { emitKey(match[1]); continue }
      const opcode = line.match(/>>\s+[0-9a-f]{2}:44:([0-9a-f]{2})/i)?.[1]?.toLowerCase()
      if (opcode && opcodeMap[opcode]) emitKey(opcodeMap[opcode])
    }
  }
  client.stdout.on('data', consume)
  client.stderr.on('data', consume)
  client.on('error', error => {
    console.warn('Pont HDMI-CEC :', error.message)
    client = null
  })
  client.on('exit', () => {
    client = null
    if (restartTimer) clearTimeout(restartTimer)
    restartTimer = setTimeout(startCecBridge, 5000)
  })
  client.stdin.write('scan\n')
  setTimeout(() => {
    if (client?.stdin.writable) client.stdin.write('as\n')
  }, 1800)
  console.log('Pont HDMI-CEC actif')
}
