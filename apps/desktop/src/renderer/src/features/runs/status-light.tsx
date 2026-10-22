import type { Run } from '@devhub/shared'
import { statusLightFor, statusLightLabels, type StatusLight } from '@devhub/shared'
import { cn } from '@renderer/lib/utils'
import { useHealthOf } from './use-run-health'
import { useOutputStatusOf } from './use-output-status'

const lightClass: Record<StatusLight, string> = {
  idle: 'bg-muted-foreground/35',
  building: 'animate-pulse bg-info',
  ready: 'bg-success',
  error: 'bg-destructive',
  exited: 'bg-muted-foreground/70'
}

export function StatusLightDot({ state }: { state: StatusLight }): React.JSX.Element {
  const label = statusLightLabels[state]
  return (
    <span
      className={cn('inline-block size-2 shrink-0 rounded-full', lightClass[state])}
      title={label}
      aria-label={label}
    />
  )
}

/** Dot for a script that declared output rules. Hidden when there is nothing to show. */
export function ScriptStatusLight({ run }: { run: Run | undefined }): React.JSX.Element {
  const output = useOutputStatusOf(run?.id)
  const health = useHealthOf(run?.status === 'running' ? run.id : undefined)
  const state = statusLightFor({
    run,
    output: output?.state,
    health: health?.state
  })
  return <StatusLightDot state={state} />
}
