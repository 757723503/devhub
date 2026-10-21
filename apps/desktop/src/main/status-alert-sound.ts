import { isAbsolute, relative, resolve } from 'path'

const sampleRate = 22050

/** Two short tones. Success is rising; error is falling. No audio dependency. */
export function toneWav(frequencies: readonly number[]): Buffer {
  const parts = frequencies.map((frequency, index) => {
    const tone = renderTone(frequency, 0.12)
    if (index === frequencies.length - 1) return tone
    return concatSamples(tone, new Int16Array(Math.floor(sampleRate * 0.04)))
  })
  return encodeWav(parts.reduce((all, part) => concatSamples(all, part)))
}

/**
 * Scales 16-bit PCM samples. Other encodings are returned unchanged.
 * A gain of 1 returns the original buffer.
 */
export function scaleWav(wav: Buffer, volume: number): Buffer {
  if (volume >= 0.999) return wav
  const gain = Math.max(0, Math.min(1, volume))
  const format = pcmFormat(wav)
  if (!format) return wav
  const out = Buffer.from(wav)
  for (let offset = format.dataStart; offset + 1 < format.dataEnd; offset += 2) {
    const sample = out.readInt16LE(offset)
    const scaled = Math.max(-32768, Math.min(32767, Math.round(sample * gain)))
    out.writeInt16LE(scaled, offset)
  }
  return out
}

function pcmFormat(wav: Buffer): { dataStart: number; dataEnd: number } | null {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') return null
  let audioFormat = 0
  let bits = 0
  let offset = 12
  let dataStart = 0
  let dataEnd = 0
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    const start = offset + 8
    if (id === 'fmt ' && start + 16 <= wav.length) {
      audioFormat = wav.readUInt16LE(start)
      bits = wav.readUInt16LE(start + 14)
    }
    if (id === 'data') {
      dataStart = start
      dataEnd = Math.min(wav.length, start + size)
    }
    offset = start + size + (size % 2)
  }
  if (audioFormat !== 1 || bits !== 16 || dataEnd <= dataStart) return null
  return { dataStart, dataEnd }
}

/** A relative wav must stay inside the project. Absolute paths are used as given. */
export function resolveNotifyWav(sound: string, projectPath: string): string | null {
  if (!sound.toLowerCase().endsWith('.wav')) return null
  if (isAbsolute(sound)) return resolve(sound)
  const absolute = resolve(projectPath, sound)
  const inside = relative(projectPath, absolute)
  if (inside.startsWith('..') || isAbsolute(inside)) return null
  return absolute
}

function renderTone(frequency: number, seconds: number): Int16Array {
  const count = Math.floor(sampleRate * seconds)
  const samples = new Int16Array(count)
  for (let i = 0; i < count; i++) {
    const envelope = Math.min(1, i / 80, (count - i) / 80)
    const wave = Math.sin((2 * Math.PI * frequency * i) / sampleRate)
    samples[i] = Math.round(wave * 0.35 * 32767 * envelope)
  }
  return samples
}

function concatSamples(left: Int16Array, right: Int16Array): Int16Array {
  const out = new Int16Array(left.length + right.length)
  out.set(left, 0)
  out.set(right, left.length)
  return out
}

function encodeWav(samples: Int16Array): Buffer {
  const dataSize = samples.length * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < samples.length; i++) buffer.writeInt16LE(samples[i] ?? 0, 44 + i * 2)
  return buffer
}
