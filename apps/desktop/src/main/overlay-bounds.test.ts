import { describe, expect, it } from 'vitest'
import {
  clampOverlayPosition,
  defaultOverlayPosition,
  overlaySizeFor,
  parseOverlayPlacement
} from './overlay-bounds'

const workArea = { x: 0, y: 0, width: 1920, height: 1080 }
const size = { width: 280, height: 640 }

describe('overlay placement', () => {
  it('defaults to the top-right of the work area', () => {
    expect(defaultOverlayPosition(workArea, size)).toEqual({ x: 1628, y: 12 })
  })

  it('uses another monitor’s work area origin', () => {
    const secondary = { x: 1920, y: 100, width: 1280, height: 800 }
    expect(defaultOverlayPosition(secondary, size)).toEqual({ x: 2908, y: 112 })
  })

  it('clamps a saved position back onto the work area', () => {
    expect(clampOverlayPosition({ x: -40, y: 5000 }, size, workArea)).toEqual({ x: 0, y: 440 })
    expect(clampOverlayPosition({ x: 100, y: 80 }, size, workArea)).toEqual({ x: 100, y: 80 })
  })

  it('shrinks the height to the work area and still clamps', () => {
    const short = { x: 0, y: 0, width: 800, height: 400 }
    expect(overlaySizeFor(short).height).toBe(376)
    expect(clampOverlayPosition({ x: 0, y: 0 }, { width: 280, height: 900 }, short)).toEqual({
      x: 0,
      y: 0
    })
  })

  it('ignores a corrupt saved placement', () => {
    expect(parseOverlayPlacement({ x: 10, y: 20, alwaysOnTop: false })).toEqual({
      x: 10,
      y: 20,
      alwaysOnTop: false
    })
    expect(parseOverlayPlacement({ x: '10', y: 20, alwaysOnTop: true })).toBeNull()
    expect(parseOverlayPlacement(null)).toBeNull()
  })
})
