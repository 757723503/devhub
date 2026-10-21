import { describe, expect, it } from 'vitest'
import {
  clampOverlayFrame,
  clampOverlayPosition,
  defaultOverlayPosition,
  finishOverlayMove,
  fitOverlayHeight,
  overlayHeightWithFloor,
  moveOverlayFrame,
  parseOverlayPlacement,
  positionForSnap,
  resizeOverlayFrame,
  snapOverlayPosition
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

  it('lifts a short panel for a popover without forgetting a taller ceiling', () => {
    expect(overlayHeightWithFloor(80, undefined, 1080, 200)).toBe(200)
    expect(overlayHeightWithFloor(400, 120, 1080, 200)).toBe(200)
    expect(overlayHeightWithFloor(400, 320, 1080, 200)).toBe(320)
    expect(overlayHeightWithFloor(400, 320, 1080)).toBe(320)
    expect(overlayHeightWithFloor(900, undefined, 400, 200)).toBe(376)
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

  it('snaps to a nearby work-area edge and keeps that edge when the height changes', () => {
    const area = { x: 0, y: 0, width: 800, height: 600 }
    expect(snapOverlayPosition({ x: 10, y: 470 }, { width: 280, height: 120 }, area)).toEqual({
      x: 0,
      y: 480,
      snap: { x: 'left', y: 'bottom' }
    })
    expect(snapOverlayPosition({ x: 400, y: 200 }, { width: 280, height: 120 }, area)).toEqual({
      x: 400,
      y: 200,
      snap: { x: null, y: null }
    })
    expect(
      positionForSnap({ x: 0, y: 480 }, { width: 280, height: 200 }, area, {
        x: 'left',
        y: 'bottom'
      })
    ).toEqual({ x: 0, y: 400 })
    expect(
      parseOverlayPlacement({
        x: 0,
        y: 10,
        alwaysOnTop: true,
        snap: { x: 'right', y: 'top' }
      })?.snap
    ).toEqual({ x: 'right', y: 'top' })
  })

  it('moves from the drag start and snaps only when the gesture ends near an edge', () => {
    const start = { x: 100, y: 40, width: 280, height: 200 }
    expect(moveOverlayFrame(start, 30, -10, workArea)).toEqual({
      x: 130,
      y: 30,
      width: 280,
      height: 200
    })
    const area = { x: 0, y: 0, width: 800, height: 600 }
    const ended = finishOverlayMove({ x: 8, y: 200, width: 280, height: 120 }, -4, 20, area)
    expect(ended.frame).toEqual({ x: 0, y: 220, width: 280, height: 120 })
    expect(ended.snap).toEqual({ x: 'left', y: null })
    expect(finishOverlayMove(start, 40, 20, workArea).snap).toBeUndefined()
  })
})
