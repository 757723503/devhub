import { describe, expect, it } from 'vitest'
import { resolveNotifyWav, toneWav } from './status-alert-sound'

describe('notify sounds', () => {
  it('writes a PCM wav header', () => {
    const wav = toneWav([880, 1320])
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE')
    expect(wav.length).toBeGreaterThan(44)
  })

  it('keeps a relative wav inside the project and rejects a parent path', () => {
    expect(resolveNotifyWav('sounds/ok.wav', '/repo')).toMatch(/[/\\]repo[/\\]sounds[/\\]ok\.wav$/)
    expect(resolveNotifyWav('../secret.wav', '/repo')).toBeNull()
    expect(resolveNotifyWav('note.txt', '/repo')).toBeNull()
    expect(resolveNotifyWav('/tmp/custom.wav', '/repo')).toMatch(/custom\.wav$/)
  })
})
