import { useEffect, useRef, useState } from 'react'
import type { Run } from '@devhub/shared'

/** Briefly marks a script button after it leaves the running state, by exit code. */
export function useExitFlash(run: Run | undefined): 'ok' | 'fail' | null {
  const [flash, setFlash] = useState<'ok' | 'fail' | null>(null)
  const previous = useRef(run?.status)

  useEffect(() => {
    const before = previous.current
    previous.current = run?.status
    if (!before || before === 'exited' || run?.status !== 'exited' || run.stopped) return
    setFlash(run.exitCode === 0 ? 'ok' : 'fail')
    const timer = setTimeout(() => setFlash(null), 1600)
    return () => clearTimeout(timer)
  }, [run?.status, run?.exitCode, run?.stopped])

  return flash
}
