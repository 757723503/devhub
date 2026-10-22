import { useEffect, useRef, useState } from 'react'
import { OutputCursor } from '@devhub/shared'
import { api, events } from '@renderer/api'

export interface RunTail {
  text: string
  /** Set from a live chunk. Null until then, so the age stays the core's activity time. */
  at: number | null
}

/**
 * Recent plain output for the panel's rows. Subscribes before reading the snapshot, same as the
 * main terminal, so nothing in between is lost.
 */
export function useRunTails(runIds: readonly string[]): Record<string, RunTail> {
  const [tails, setTails] = useState<Record<string, RunTail>>({})
  const cursors = useRef(new Map<string, OutputCursor>())
  const held = useRef(new Map<string, { offset: number; data: string }[] | null>())
  const idsKey = [...runIds].sort().join('\n')

  useEffect(() => {
    const wanted = new Set(idsKey ? idsKey.split('\n') : [])

    const append = (runId: string, chunk: string, fromEvent: boolean): void => {
      if (!chunk) return
      setTails((current) => {
        const previous = current[runId]
        return {
          ...current,
          [runId]: {
            text: ((previous?.text ?? '') + chunk).slice(-6000),
            at: fromEvent ? Date.now() : (previous?.at ?? null)
          }
        }
      })
    }

    const unsubscribe = events.subscribe((event) => {
      if (event.type !== 'run-output' || !wanted.has(event.runId)) return
      const cursor = cursors.current.get(event.runId) ?? new OutputCursor()
      cursors.current.set(event.runId, cursor)
      const waiting = held.current.get(event.runId)
      if (waiting) {
        waiting.push({ offset: event.offset, data: event.data })
        return
      }
      append(event.runId, cursor.accept(event.offset, event.data), true)
    })

    for (const runId of wanted) {
      if (held.current.has(runId)) continue
      const cursor = cursors.current.get(runId) ?? new OutputCursor()
      cursors.current.set(runId, cursor)
      const queue: { offset: number; data: string }[] = []
      held.current.set(runId, queue)
      void api
        .getRunOutput(runId)
        .then((snapshot) => append(runId, cursor.acceptSnapshot(snapshot), false))
        .catch(() => undefined)
        .finally(() => {
          held.current.set(runId, null)
          for (const chunk of queue) append(runId, cursor.accept(chunk.offset, chunk.data), true)
        })
    }

    return () => unsubscribe()
  }, [idsKey])

  return tails
}
