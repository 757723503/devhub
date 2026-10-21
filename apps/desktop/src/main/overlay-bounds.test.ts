import { describe, expect, it } from 'vitest'
import {
  clampOverlayFrame,
  clampOverlayPosition,
  defaultOverlayPosition,
  fitOverlayHeight,
  parseOverlayPlacement,
  resizeOverlayFrame
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

  it('keeps a panel taller than the work area pinned to the top-left', () => {
    const short = { x: 0, y: 0, width: 800, height: 400 }
    expect(clampOverlayPosition({ x: 0, y: 0 }, { width: 280, height: 900 }, short)).toEqual({
      x: 0,
      y: 0
    })
  })

  it('hugs content unless a vertical drag set a lower ceiling', () => {
    expect(fitOverlayHeight(220, undefined, 1080)).toBe(220)
    expect(fitOverlayHeight(900, undefined, 400)).toBe(376)
    expect(fitOverlayHeight(900, 400, 1080)).toBe(400)
    expect(fitOverlayHeight(120, 400, 1080)).toBe(120)
    expect(fitOverlayHeight(20, undefined, 1080)).toBe(48)
  })

  it('grows from the east edge and from the west edge without leaving the min width', () => {
    const start = { x: 100, y: 40, width: 280, height: 200 }
    const limits = { minWidth: 220, maxWidth: 520, minHeight: 48, maxHeight: 800 }
    expect(resizeOverlayFrame(start, 40, 0, 'e', limits)).toEqual({
      x: 100,
      y: 40,
      width: 320,
      height: 200
    })
    expect(resizeOverlayFrame(start, -40, 0, 'w', limits)).toEqual({
      x: 60,
      y: 40,
      width: 320,
      height: 200
    })
    expect(resizeOverlayFrame(start, -200, 10, 'sw', limits)).toEqual({
      x: -100,
      y: 40,
      width: 480,
      height: 210
    })
    expect(resizeOverlayFrame(start, -80, 0, 'e', limits).width).toBe(220)
  })

  it('clamps a dragged frame into the work area', () => {
    const work = { x: 0, y: 0, width: 800, height: 400 }
    expect(clampOverlayFrame({ x: 0, y: 0, width: 600, height: 900 }, work)).toEqual({
      x: 0,
      y: 0,
      width: 520,
      height: 376
    })
    expect(clampOverlayFrame({ x: 700, y: 300, width: 280, height: 200 }, work)).toEqual({
      x: 520,
      y: 200,
      width: 280,
      height: 200
    })
  })

  it('reads a saved width and ceiling, and still accepts a file from before resizing', () => {
    expect(parseOverlayPlacement({ x: 10, y: 20, alwaysOnTop: false })).toEqual({
      x: 10,
      y: 20,
      alwaysOnTop: false
    })
    expect(
      parseOverlayPlacement({ x: 10, y: 20, alwaysOnTop: true, width: 360, maxHeight: 240 })
    ).toEqual({
      x: 10,
      y: 20,
      alwaysOnTop: true,
      width: 360,
      maxHeight: 240
    })
    expect(parseOverlayPlacement({ x: '10', y: 20, alwaysOnTop: true })).toBeNull()
    expect(parseOverlayPlacement({ x: 10, y: 20, alwaysOnTop: true, width: 'wide' })).toBeNull()
    expect(parseOverlayPlacement(null)).toBeNull()
  })
})
