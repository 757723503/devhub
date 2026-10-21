import type { OverlayResizeEdge } from '@devhub/shared'
import { z } from 'zod'

/** Default width. The user can drag a different one; height follows the content. */
export const overlayWidth = 280
export const overlayMinWidth = 220
export const overlayMaxWidth = 520
/** Header row. The window never collapses past this, even with nothing listed. */
export const overlayMinHeight = 48
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
  /** User-chosen width. Absent on files saved before resizing existed. */
  width?: number
  /**
   * Ceiling from a vertical drag. Absent means the window always hugs its content.
   * The visible height is the content until it passes this, then the body scrolls.
   */
  maxHeight?: number
}

const placementSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  alwaysOnTop: z.boolean(),
  width: z.number().finite().optional(),
  maxHeight: z.number().finite().optional()
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
