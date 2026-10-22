import { describe, expect, it } from 'vitest'
import { resolveNotifyWav, scaleWav, toneWav } from './status-alert-sound'

describe('notify sounds', () => {
  it('writes a PCM wav header', () => {
    const wav = toneWav([880, 1320])
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE')
    expect(wav.length).toBeGreaterThan(44)
  })

  it('scales 16-bit samples and leaves a full-volume buffer untouched', () => {
    const wav = toneWav([440])
    expect(scaleWav(wav, 1)).toBe(wav)
    let offset = 44
    while (offset + 1 < wav.length && wav.readInt16LE(offset) === 0) offset += 2
    const quiet = scaleWav(wav, 0.5)
    expect(wav.readInt16LE(offset)).not.toBe(0)
    expect(quiet.readInt16LE(offset)).toBe(Math.round(wav.readInt16LE(offset) * 0.5))
    expect(scaleWav(wav, 0).readInt16LE(offset)).toBe(0)
  })

  it('keeps a relative wav inside the project and rejects a parent path', () => {
    expect(resolveNotifyWav('sounds/ok.wav', '/repo')).toMatch(/[/\\]repo[/\\]sounds[/\\]ok\.wav$/)
    expect(resolveNotifyWav('../secret.wav', '/repo')).toBeNull()
    expect(resolveNotifyWav('note.txt', '/repo')).toBeNull()
    expect(resolveNotifyWav('/tmp/custom.wav', '/repo')).toMatch(/custom\.wav$/)
  })
})
