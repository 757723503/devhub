import { z } from 'zod'

/** Content size of the floating panel. Height shrinks on a short work area. */
export const overlayWidth = 280
export const overlayHeight = 640
export const overlayMargin = 12

export interface Size {
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface OverlayPlacement {
  x: number
  y: number
  alwaysOnTop: boolean
}

const placementSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  alwaysOnTop: z.boolean()
})

export function parseOverlayPlacement(raw: unknown): OverlayPlacement | null {
  const parsed = placementSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function overlaySizeFor(workArea: Pick<Rect, 'width' | 'height'>): Size {
  return {
    width: overlayWidth,
    height: Math.max(320, Math.min(overlayHeight, workArea.height - overlayMargin * 2))
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Keeps the panel inside the work area. A panel taller than the area stays top-left aligned. */
export function clampOverlayPosition(
  position: { x: number; y: number },
  size: Size,
  workArea: Rect
): {
  x: number
  y: number
} {
  const minX = workArea.x
  const minY = workArea.y
  const maxX = Math.max(minX, workArea.x + workArea.width - size.width)
  const maxY = Math.max(minY, workArea.y + workArea.height - size.height)
  return { x: clamp(position.x, minX, maxX), y: clamp(position.y, minY, maxY) }
}

/** Top-right of the work area, inset by `overlayMargin`. */
export function defaultOverlayPosition(workArea: Rect, size: Size): { x: number; y: number } {
  return clampOverlayPosition(
    {
      x: workArea.x + workArea.width - size.width - overlayMargin,
      y: workArea.y + overlayMargin
    },
    size,
    workArea
  )
}
