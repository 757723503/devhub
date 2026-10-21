import { useRef } from 'react'
import type { OverlayResizeEdge, OverlayResizeGesture } from '@devhub/shared'
import { shell } from '@renderer/api'
import { cn } from '@renderer/lib/utils'

const handles: { edge: OverlayResizeEdge; className: string }[] = [
  { edge: 'n', className: 'top-0 right-3 left-3 h-1.5 cursor-ns-resize' },
  { edge: 's', className: 'right-3 bottom-0 left-3 h-1.5 cursor-ns-resize' },
  { edge: 'e', className: 'top-3 right-0 bottom-3 w-1.5 cursor-ew-resize' },
  { edge: 'w', className: 'top-3 bottom-3 left-0 w-1.5 cursor-ew-resize' },
  { edge: 'nw', className: 'top-0 left-0 size-3 cursor-nwse-resize' },
  { edge: 'ne', className: 'top-0 right-0 size-3 cursor-nesw-resize' },
  { edge: 'sw', className: 'bottom-0 left-0 size-3 cursor-nesw-resize' },
  { edge: 'se', className: 'right-0 bottom-0 size-3 cursor-nwse-resize' }
]

/**
 * Invisible grips inside the card. A transparent frameless window has no native resize border
 * on Windows, so the drag is tracked here and applied with setBounds.
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

  const send = (gesture: OverlayResizeGesture): void => {
    void shell?.resizeOverlay(gesture)
  }

  const flush = (): void => {
    frame.current = 0
    const next = pending.current
    if (!next) return
    send({ ...next, edge, phase: 'move' })
  }

  return (
    <div
      data-overlay-resize={edge}
      className={cn('app-no-drag pointer-events-auto absolute', className)}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        origin.current = { x: event.screenX, y: event.screenY }
        pending.current = null
        send({ dx: 0, dy: 0, edge, phase: 'start' })
      }}
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
        cancelAnimationFrame(frame.current)
        frame.current = 0
        const dx = event.screenX - origin.current.x
        const dy = event.screenY - origin.current.y
        origin.current = null
        pending.current = null
        send({ dx, dy, edge, phase: 'end' })
      }}
    />
  )
}
