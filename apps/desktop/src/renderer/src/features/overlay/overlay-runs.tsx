import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Loader2, Play, RotateCw, Square } from 'lucide-react'
import {
  formatActivityAge,
  lastOutputLine,
  statusLightFor,
  stripAnsi,
  type Run,
  type Script
} from '@devhub/shared'
import { shell } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { StatusLightDot } from '@renderer/features/runs/status-light'
import { useOutputStatusOf } from '@renderer/features/runs/use-output-status'
import {
  PortConflictError,
  useRestartRun,
  useStartScript,
  useStopRun
} from '@renderer/features/runs/use-runs'
import { useHealthOf } from '@renderer/features/runs/use-run-health'
import { ConfirmScriptDialog } from '@renderer/features/scripts/confirm-script-dialog'
import { cn } from '@renderer/lib/utils'
import { useRunTails } from './use-run-tails'

function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

export function OverlayRuns({
  projectId,
  scripts,
  runs,
  onError
}: {
  projectId: string
  scripts: Script[]
  runs: Run[]
  onError: (error: Error, retry?: () => void) => void
}): React.JSX.Element {
  const longRunning = scripts.filter((script) => script.outputStatus)
  const runIds = longRunning.flatMap((script) => {
    const run = findRun(runs, projectId, script.id)
    return run ? [run.id] : []
  })
  const tails = useRunTails(runIds)
  const now = useNow()
  const [openId, setOpenId] = useState<string | null>(null)

  if (longRunning.length === 0) {
    return (
      <section className="flex flex-col gap-1">
        <h3 className="px-1 text-[11px] font-medium text-muted-foreground">长期运行</h3>
        <p className="px-1 text-[11px] text-muted-foreground">
          没有带 status 规则的脚本。在 .devhub.yaml 里为 watch 命令声明 status。
        </p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-1">
      <h3 className="px-1 text-[11px] font-medium text-muted-foreground">长期运行</h3>
      <ul className="flex flex-col gap-1">
        {longRunning.map((script) => (
          <OverlayRunRow
            key={script.id}
            projectId={projectId}
            script={script}
            run={findRun(runs, projectId, script.id)}
            tail={tails[findRun(runs, projectId, script.id)?.id ?? '']}
            now={now}
            open={openId === script.id}
            onOpen={() => setOpenId(script.id)}
            onError={onError}
          />
        ))}
      </ul>
    </section>
  )
}

function findRun(runs: Run[], projectId: string, scriptId: string): Run | undefined {
  return runs.find(
    (run) => run.kind === 'script' && run.projectId === projectId && run.scriptId === scriptId
  )
}

function OverlayRunRow({
  projectId,
  script,
  run,
  tail,
  now,
  open,
  onOpen,
  onError
}: {
  projectId: string
  script: Script
  run: Run | undefined
  tail: { text: string; at: number | null } | undefined
  now: number
  open: boolean
  onOpen: () => void
  onError: (error: Error, retry?: () => void) => void
}): React.JSX.Element {
  const output = useOutputStatusOf(run?.id)
  const health = useHealthOf(run?.status === 'running' ? run.id : undefined)
  const light = statusLightFor({ run, output: output?.state, health: health?.state })
  const line = tail?.text ? lastOutputLine(tail.text) : (output?.lastLine ?? '')
  const activityAt = tail?.at ?? (output ? Date.parse(output.activityAt) : Number.NaN)
  const age = Number.isFinite(activityAt) ? formatActivityAge(activityAt, now) : ''
  const [confirmOpen, setConfirmOpen] = useState(false)
  const start = useStartScript()
  const stop = useStopRun()
  const restart = useRestartRun()
  const active = run && run.status !== 'exited'
  const busy = start.isPending || stop.isPending || restart.isPending

  const focusMain = (): void => {
    if (run) void shell?.focusRun(projectId, run.id)
    else void shell?.showMainWindow()
  }

  const startScript = (ignorePortConflicts = false): void => {
    const startAnyway = (): void => startScript(true)
    start.mutate(
      { projectId, scriptId: script.id, ignorePortConflicts },
      {
        onError: (error) =>
          onError(
            error,
            !ignorePortConflicts && error instanceof PortConflictError ? startAnyway : undefined
          )
      }
    )
  }

  return (
    <li className="rounded-lg bg-background/50">
      <div
        className="flex cursor-pointer items-start gap-1.5 px-1.5 py-1"
        onClick={onOpen}
        onDoubleClick={focusMain}
      >
        <span className="mt-1.5">
          <StatusLightDot state={light} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium" title={script.name}>
            {script.name}
          </div>
          <div className="truncate text-[10px] text-muted-foreground" title={line || undefined}>
            {line || '尚无输出'}
            {age && <span className="ml-1">{age}</span>}
          </div>
        </div>
        <div
          className="app-no-drag flex shrink-0 items-center"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {active ? (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={busy || run.status === 'stopping'}
                aria-label={`重启 ${script.name}`}
                onClick={() => restart.mutate(run.id, { onError: (error) => onError(error) })}
              >
                <RotateCw />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={busy || run.status === 'stopping'}
                aria-label={`停止 ${script.name}`}
                onClick={() => stop.mutate(run.id, { onError: (error) => onError(error) })}
              >
                {run.status === 'stopping' ? <Loader2 className="animate-spin" /> : <Square />}
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={busy}
              aria-label={`运行 ${script.name}`}
              onClick={() => (script.confirm ? setConfirmOpen(true) : startScript())}
            >
              {start.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`在主窗口打开 ${script.name}`}
            title="在主窗口打开终端"
            onClick={focusMain}
          >
            <ExternalLink />
          </Button>
        </div>
      </div>
      {open && run && <MiniTerminal text={tail?.text ?? ''} />}
      <ConfirmScriptDialog
        scriptName={script.name}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => startScript()}
      />
    </li>
  )
}

function MiniTerminal({ text }: { text: string }): React.JSX.Element {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    const node = ref.current
    if (node) node.scrollTop = node.scrollHeight
  }, [text])
  const plain = text ? stripAnsi(text) : ''
  return (
    <pre
      ref={ref}
      className={cn(
        'mx-1.5 mb-1.5 max-h-28 overflow-auto rounded-md bg-muted/50 p-1.5 font-mono text-[10px] leading-snug whitespace-pre-wrap break-all text-foreground'
      )}
    >
      {plain || '尚无输出'}
    </pre>
  )
}
