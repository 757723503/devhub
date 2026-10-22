import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { OverlayResizeEdge, OverlayResizeGesture } from '@devhub/shared'
import { shell } from '@renderer/api'
import { cn } from '@renderer/lib/utils'
import { resumeOverlayFit, suspendOverlayFit } from './overlay-fit-pause'

/** At least 8px so the grip is wider than the old 6px sliver and easy to hit. */
const handles: { edge: OverlayResizeEdge; className: string }[] = [
  { edge: 'n', className: 'top-0 right-3 left-3 h-2 cursor-ns-resize' },
  { edge: 's', className: 'right-3 bottom-0 left-3 h-2 cursor-ns-resize' },
  { edge: 'e', className: 'top-3 right-0 bottom-3 w-2 cursor-ew-resize' },
  { edge: 'w', className: 'top-3 bottom-3 left-0 w-2 cursor-ew-resize' },
  { edge: 'nw', className: 'top-0 left-0 size-3 cursor-nwse-resize' },
  { edge: 'ne', className: 'top-0 right-0 size-3 cursor-nesw-resize' },
  { edge: 'sw', className: 'bottom-0 left-0 size-3 cursor-nesw-resize' },
  { edge: 'se', className: 'right-0 bottom-0 size-3 cursor-nwse-resize' }
]

/**
 * Grips inside the card. Windows has no usable native resize border on this window
 * (the OS flag would swallow these edges), so the drag is tracked here and applied with setBounds.
 */
export function OverlayResizeHandles(): React.JSX.Element | null {
  if (!shell) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {handles.map((handle) => (
        <ResizeHandle key={handle.edge} edge={handle.edge} className={handle.className} />
      ))}
    </div>
  )
}

function ResizeHandle({
  edge,
  className
}: {
  edge: OverlayResizeEdge
  className: string
}): React.JSX.Element {
  const origin = useRef<{ x: number; y: number } | null>(null)
  const frame = useRef(0)
  const pending = useRef<{ dx: number; dy: number } | null>(null)
  const held = useRef(false)

  const send = (gesture: OverlayResizeGesture): void => {
    void shell?.resizeOverlay(gesture)
  }

  const finish = (dx: number, dy: number): void => {
    if (!held.current) return
    held.current = false
    cancelAnimationFrame(frame.current)
    frame.current = 0
    origin.current = null
    pending.current = null
    void Promise.resolve(shell?.resizeOverlay({ dx, dy, edge, phase: 'end' })).finally(() =>
      resumeOverlayFit()
    )
  }

  const flush = (): void => {
    frame.current = 0
    const next = pending.current
    if (!next) return
    send({ ...next, edge, phase: 'move' })
  }

  const begin = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    // Capture phase: the card's move listener is native and runs before React's
    // bubble handler, so stopping here is what keeps a grip from also moving the window.
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = { x: event.screenX, y: event.screenY }
    pending.current = null
    held.current = true
    // Before the start IPC, so a content-height report cannot land mid-drag.
    suspendOverlayFit()
    send({ dx: 0, dy: 0, edge, phase: 'start' })
  }

  return (
    <div
      data-overlay-resize={edge}
      data-no-drag
      className={cn(
        'app-no-drag pointer-events-auto absolute touch-none bg-foreground/[0.03]',
        className
      )}
      onPointerDownCapture={begin}
      onPointerMove={(event) => {
        if (!origin.current) return
        pending.current = {
          dx: event.screenX - origin.current.x,
          dy: event.screenY - origin.current.y
        }
        if (frame.current) return
        frame.current = requestAnimationFrame(flush)
      }}
      onPointerUp={(event) => {
        if (!origin.current) return
        finish(event.screenX - origin.current.x, event.screenY - origin.current.y)
      }}
      onPointerCancel={(event) => {
        if (!origin.current) return
        finish(event.screenX - origin.current.x, event.screenY - origin.current.y)
      }}
      onLostPointerCapture={(event) => {
        if (!origin.current) return
        finish(event.screenX - origin.current.x, event.screenY - origin.current.y)
      }}
    />
  )
}
