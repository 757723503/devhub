import { useEffect, type RefObject } from 'react'
import type { OverlayMoveGesture } from '@devhub/shared'
import { shell } from '@renderer/api'
import { resumeOverlayFit, suspendOverlayFit } from './overlay-fit-pause'

/** Movement below this stays a click. Past it, the blank area drags the window. */
const dragThreshold = 4

/**
 * Windows treats `-webkit-app-region: drag` on an ancestor as a dead zone: nested
 * `no-drag` elements often never receive the click. Blank space is handled here instead,
 * and interactive targets are left to the browser.
 */
const interactiveSelector = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'label',
  'pre',
  '[role="button"]',
  '[role="slider"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[data-no-drag]',
  '[data-slot="popover-content"]',
  '[data-overlay-resize]',
  '[data-slot="button"]'
].join(',')

export function isOverlayDragSurface(target: EventTarget | null): boolean {
  const element =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  return Boolean(element && !element.closest(interactiveSelector))
}

export function useOverlayWindowDrag(cardRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const card = cardRef.current
    if (!card || !shell) return

    let origin: { x: number; y: number } | null = null
    let dragging = false
    let frame = 0
    let pending: { dx: number; dy: number } | null = null
    let queue: Promise<void> = Promise.resolve()

    const send = (gesture: OverlayMoveGesture): void => {
      const api = shell
      if (!api) return
      queue = queue.then(() => api.moveOverlay(gesture)).catch(() => undefined)
    }

    const flush = (): void => {
      frame = 0
      const next = pending
      if (!next || !dragging) return
      send({ ...next, phase: 'move' })
    }

    const finish = (event: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (!origin) return
      const dx = event.screenX - origin.x
      const dy = event.screenY - origin.y
      origin = null
      cancelAnimationFrame(frame)
      frame = 0
      pending = null
      if (!dragging) return
      dragging = false
      send({ dx, dy, phase: 'end' })
      void queue.finally(() => resumeOverlayFit())
    }

    const onMove = (event: PointerEvent): void => {
      if (!origin) return
      const dx = event.screenX - origin.x
      const dy = event.screenY - origin.y
      if (!dragging) {
        if (Math.hypot(dx, dy) < dragThreshold) return
        dragging = true
        suspendOverlayFit()
        try {
          card.setPointerCapture(event.pointerId)
        } catch {
          // The pointer can end before capture. Window listeners still track it.
        }
        send({ dx: 0, dy: 0, phase: 'start' })
      }
      pending = { dx, dy }
      if (frame) return
      frame = requestAnimationFrame(flush)
    }

    function onDown(event: PointerEvent): void {
      if (event.button !== 0 || !isOverlayDragSurface(event.target)) return
      event.preventDefault()
      origin = { x: event.screenX, y: event.screenY }
      dragging = false
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', finish)
      window.addEventListener('pointercancel', finish)
    }

    card.addEventListener('pointerdown', onDown)
    return () => {
      card.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      cancelAnimationFrame(frame)
    }
  }, [cardRef])
}
