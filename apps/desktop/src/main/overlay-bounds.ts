import type { OverlayResizeEdge } from '@devhub/shared'
import { z } from 'zod'

/** Default width. The user can drag a different one; height follows the content. */
export const overlayWidth = 280
export const overlayMinWidth = 220
export const overlayMaxWidth = 520
/** Header row. The window never collapses past this, even with nothing listed. */
export const overlayMinHeight = 48
export const overlayMargin = 12
/** How close a drag must end to a work-area edge before the panel sticks to it. */
export const overlaySnapDistance = 16

export interface OverlaySnapAnchor {
  x: 'left' | 'right' | null
  y: 'top' | 'bottom' | null
}

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
  /** User-chosen width. Absent on files saved before resizing existed. */
  width?: number
  /**
   * Ceiling from a vertical drag. Absent means the window always hugs its content.
   * The visible height is the content until it passes this, then the body scrolls.
   */
  maxHeight?: number
  /** Edge the panel was snapped to. Height changes keep a bottom or top snap. */
  snap?: OverlaySnapAnchor
}

const placementSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  alwaysOnTop: z.boolean(),
  width: z.number().finite().optional(),
  maxHeight: z.number().finite().optional(),
  snap: z
    .object({
      x: z.enum(['left', 'right']).nullable(),
      y: z.enum(['top', 'bottom']).nullable()
    })
    .optional()
})

export function parseOverlayPlacement(raw: unknown): OverlayPlacement | null {
  const parsed = placementSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function clampOverlayWidth(width: number, workAreaWidth: number): number {
  const max = Math.max(
    overlayMinWidth,
    Math.min(overlayMaxWidth, workAreaWidth - overlayMargin * 2)
  )
  return clamp(Math.round(width), overlayMinWidth, max)
}

/** Visible height: content, but never above the user's ceiling or the work area. */
export function fitOverlayHeight(
  contentHeight: number,
  maxHeight: number | undefined,
  workAreaHeight: number
): number {
  const workCap = Math.max(overlayMinHeight, workAreaHeight - overlayMargin * 2)
  const cap =
    maxHeight === undefined ? workCap : Math.min(Math.max(maxHeight, overlayMinHeight), workCap)
  const content = Number.isFinite(contentHeight) ? contentHeight : overlayMinHeight
  return clamp(Math.round(content), overlayMinHeight, cap)
}

/**
 * Same as {@link fitOverlayHeight}, except `floor` can raise a short window so a popover
 * stays inside it. A taller user ceiling is left alone, and the saved ceiling is not changed.
 */
export function overlayHeightWithFloor(
  contentHeight: number,
  maxHeight: number | undefined,
  workAreaHeight: number,
  floor?: number
): number {
  const capped = fitOverlayHeight(contentHeight, maxHeight, workAreaHeight)
  if (floor === undefined) return capped
  const expanded = fitOverlayHeight(Math.max(contentHeight, floor), undefined, workAreaHeight)
  const room = fitOverlayHeight(floor, undefined, workAreaHeight)
  return Math.min(expanded, Math.max(capped, room))
}

export interface OverlaySizeLimits {
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
}

/** Live frame while dragging an edge. `dx`/`dy` are screen pixels from pointer-down. */
export function resizeOverlayFrame(
  start: Rect,
  dx: number,
  dy: number,
  edge: OverlayResizeEdge,
  limits: OverlaySizeLimits
): Rect {
  let width = start.width
  let height = start.height
  if (edge.includes('e')) width = start.width + dx
  if (edge.includes('w')) width = start.width - dx
  if (edge.includes('s')) height = start.height + dy
  if (edge.includes('n')) height = start.height - dy
  width = clamp(Math.round(width), limits.minWidth, Math.max(limits.minWidth, limits.maxWidth))
  height = clamp(Math.round(height), limits.minHeight, Math.max(limits.minHeight, limits.maxHeight))
  return {
    x: edge.includes('w') ? start.x + start.width - width : start.x,
    y: edge.includes('n') ? start.y + start.height - height : start.y,
    width,
    height
  }
}

/** Pulls a dragged frame back into the work area without crossing min size. */
export function clampOverlayFrame(frame: Rect, workArea: Rect): Rect {
  const width = clampOverlayWidth(frame.width, workArea.width)
  const height = clamp(
    Math.round(frame.height),
    overlayMinHeight,
    Math.max(overlayMinHeight, workArea.height - overlayMargin * 2)
  )
  return { ...clampOverlayPosition(frame, { width, height }, workArea), width, height }
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

/**
 * Sticks a position to a work-area edge when it lands within `distance` pixels.
 * A drag that ends farther away clears that axis.
 */
export function snapOverlayPosition(
  position: { x: number; y: number },
  size: Size,
  workArea: Rect,
  distance = overlaySnapDistance
): { x: number; y: number; snap: OverlaySnapAnchor } {
  let x = position.x
  let y = position.y
  const snap: OverlaySnapAnchor = { x: null, y: null }
  const left = workArea.x
  const right = workArea.x + workArea.width - size.width
  const top = workArea.y
  const bottom = workArea.y + workArea.height - size.height
  if (Math.abs(x - left) <= distance) {
    x = left
    snap.x = 'left'
  } else if (Math.abs(x - right) <= distance) {
    x = right
    snap.x = 'right'
  }
  if (Math.abs(y - top) <= distance) {
    y = top
    snap.y = 'top'
  } else if (Math.abs(y - bottom) <= distance) {
    y = bottom
    snap.y = 'bottom'
  }
  return { x, y, snap }
}

/** Keeps a snapped edge when the window's size or the display changes. */
export function positionForSnap(
  position: { x: number; y: number },
  size: Size,
  workArea: Rect,
  snap: OverlaySnapAnchor | undefined
): { x: number; y: number } {
  if (!snap) return { x: position.x, y: position.y }
  let x = position.x
  let y = position.y
  if (snap.x === 'left') x = workArea.x
  if (snap.x === 'right') x = workArea.x + workArea.width - size.width
  if (snap.y === 'top') y = workArea.y
  if (snap.y === 'bottom') y = workArea.y + workArea.height - size.height
  return { x, y }
}

/** Bounding box of every rect. The virtual desktop while a drag crosses monitors. */
export function unionRects(rects: readonly Rect[]): Rect {
  const first = rects[0]
  if (!first) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = first.x
  let minY = first.y
  let maxRight = first.x + first.width
  let maxBottom = first.y + first.height
  for (const rect of rects) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxRight = Math.max(maxRight, rect.x + rect.width)
    maxBottom = Math.max(maxBottom, rect.y + rect.height)
  }
  return { x: minX, y: minY, width: maxRight - minX, height: maxBottom - minY }
}

/** Live position while dragging the panel. `dx`/`dy` are screen pixels from the threshold. */
export function moveOverlayFrame(start: Rect, dx: number, dy: number, bounds: Rect): Rect {
  const position = clampOverlayPosition(
    { x: Math.round(start.x + dx), y: Math.round(start.y + dy) },
    start,
    bounds
  )
  return { ...start, x: position.x, y: position.y }
}

/**
 * Where a drag ends. Movement uses `travelBounds` (one work area, or the virtual
 * desktop). Snap and the final clamp use only `workArea` — the display under the
 * released frame, not the display where the drag began.
 */
export function finishOverlayMove(
  start: Rect,
  dx: number,
  dy: number,
  workArea: Rect,
  travelBounds: Rect = workArea
): { frame: Rect; snap: OverlaySnapAnchor | undefined } {
  const moved = moveOverlayFrame(start, dx, dy, travelBounds)
  const snapped = snapOverlayPosition(moved, moved, workArea)
  const position = clampOverlayPosition(snapped, moved, workArea)
  return {
    frame: { ...moved, x: position.x, y: position.y },
    snap: snapped.snap.x || snapped.snap.y ? snapped.snap : undefined
  }
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
