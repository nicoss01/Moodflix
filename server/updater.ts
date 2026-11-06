import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const appDir = process.cwd()
const branch = process.env.MOODFLIX_BRANCH || 'main'
const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' }

export type UpdateCommit = {
  hash: string
  shortHash: string
  author: string
  date: string
  subject: string
}

export type UpdateStatus = {
  available: boolean
  branch: string
  localCommit: string
  remoteCommit: string
  commits: UpdateCommit[]
  checkedAt: string
}

let updateRunning = false

async function run(command: string, args: string[], timeout = 60000) {
  const { stdout } = await execFileAsync(command, args, {
    cwd: appDir,
    env: gitEnv,
    timeout,
    maxBuffer: 10 * 1024 * 1024
  })
  return stdout.trim()
}

async function git(args: string[], timeout?: number) {
  return run('git', args, timeout)
}

export function parseCommitLog(output: string): UpdateCommit[] {
  return output.split('\x1e').map(record => record.trim()).filter(Boolean).map(record => {
    const [hash, shortHash, author, date, ...subject] = record.split('\x1f')
    return { hash, shortHash, author, date, subject: subject.join('\x1f') }
  })
}

export async function checkForUpdate(): Promise<UpdateStatus> {
  await git(['fetch', '--quiet', '--prune', 'origin', branch], 90000)
  const localCommit = await git(['rev-parse', 'HEAD'])
  const remoteCommit = await git(['rev-parse', `origin/${branch}`])
  const available = localCommit !== remoteCommit
  const log = available
    ? await git(['log', '--max-count=20', '--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e', `${localCommit}..${remoteCommit}`])
    : ''
  return { available, branch, localCommit, remoteCommit, commits: parseCommitLog(log), checkedAt: new Date().toISOString() }
}

export async function applyUpdate(): Promise<UpdateStatus> {
  if (updateRunning) throw new Error('Une mise à jour est déjà en cours')
  updateRunning = true
  try {
    const dirty = await git(['status', '--porcelain', '--untracked-files=no'])
    if (dirty) throw new Error('Des modifications locales empêchent la mise à jour automatique')
    const status = await checkForUpdate()
    if (!status.available) return status
    try {
      await git(['merge-base', '--is-ancestor', status.localCommit, status.remoteCommit])
    } catch {
      throw new Error('La branche distante ne permet pas une mise à jour en avance rapide')
    }
    await git(['merge', '--ff-only', `origin/${branch}`], 90000)
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    await run(npm, ['ci'], 10 * 60 * 1000)
    await run(npm, ['run', 'build'], 10 * 60 * 1000)
    return { ...status, localCommit: status.remoteCommit, available: false }
  } finally {
    updateRunning = false
  }
}

export function isUpdateRunning() { return updateRunning }
