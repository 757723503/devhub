import { createHash } from 'crypto'
import { spawn } from 'child_process'
import { access, mkdir, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { Notification } from 'electron'
import type { DevhubEvent } from '@devhub/shared'
import { resolveNotifyWav, scaleWav, toneWav } from './status-alert-sound'

let sounds: Promise<{ ready: string; error: string }> | null = null

function builtinSounds(): Promise<{ ready: string; error: string }> {
  sounds ??= (async () => {
    const dir = join(tmpdir(), 'devhub-notify')
    await mkdir(dir, { recursive: true })
    const ready = join(dir, 'ready.wav')
    const error = join(dir, 'error.wav')
    await writeFile(ready, toneWav([880, 1320]))
    await writeFile(error, toneWav([440, 330]))
    return { ready, error }
  })()
  return sounds
}

function playFile(filePath: string): void {
  if (process.platform === 'win32') {
    const literal = filePath.split("'").join("''")
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(New-Object System.Media.SoundPlayer '${literal}').Play()`
      ],
      { windowsHide: true, stdio: 'ignore' }
    )
    child.on('error', () => undefined)
    child.unref()
    return
  }
  const child = spawn('paplay', [filePath], { stdio: 'ignore' })
  child.on('error', () => {
    const fallback = spawn('aplay', ['-q', filePath], { stdio: 'ignore' })
    fallback.on('error', () => undefined)
    fallback.unref()
  })
  child.unref()
}

async function playSound(sound: string, projectPath: string, volume: number): Promise<void> {
  if (volume <= 0) return
  let file: string | null
  if (sound === 'default' || sound === 'error') {
    const files = await builtinSounds()
    file = sound === 'default' ? files.ready : files.error
  } else {
    file = resolveNotifyWav(sound, projectPath)
    if (!file) {
      console.warn('[notify] sound must be default, error, or a .wav path')
      return
    }
    try {
      await access(file)
    } catch {
      console.warn('[notify] sound file missing:', file)
      return
    }
  }
  if (volume >= 0.999) {
    playFile(file)
    return
  }
  const scaled = scaleWav(await readFile(file), volume)
  const id = createHash('sha1').update(file).digest('hex').slice(0, 8)
  const dest = join(
    tmpdir(),
    'devhub-notify',
    `vol-${Math.round(volume * 100)}-${id}-${basename(file)}`
  )
  await writeFile(dest, scaled)
  playFile(dest)
}

/** Shows the toast and plays the wav. Mute and a zero volume skip the sound only. */
export function attachStatusAlerts(deps: {
  subscribe: (listener: (event: DevhubEvent) => void) => () => void
  muted: () => boolean
  volume: () => number
}): () => void {
  return deps.subscribe((event) => {
    if (event.type !== 'status-notify') return
    if (event.toast && Notification.isSupported()) {
      new Notification({ title: event.scriptName, body: event.body }).show()
    }
    if (!event.sound || deps.muted()) return
    void playSound(event.sound, event.projectPath, deps.volume()).catch((error: unknown) =>
      console.warn('[notify] could not play sound', error)
    )
  })
}
