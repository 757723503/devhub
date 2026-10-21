import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { isScriptFavorite, type Run, type Script } from '@devhub/shared'
import { Button } from '@renderer/components/ui/button'
import { useScriptFavorites } from '@renderer/features/scripts/use-favorites'
import { ConfirmScriptDialog } from '@renderer/features/scripts/confirm-script-dialog'
import { ScriptSettingsButton } from '@renderer/features/scripts/script-settings-dialog'
import { PortConflictError, useStartScript } from '@renderer/features/runs/use-runs'
import { cn } from '@renderer/lib/utils'
import { useExitFlash } from './use-exit-flash'

export function OverlayFavorites({
  projectId,
  scripts,
  runs,
  onError,
  onSettingsOpenChange
}: {
  projectId: string
  scripts: Script[]
  runs: Run[]
  onError: (error: Error, retry?: () => void) => void
  onSettingsOpenChange?: (open: boolean) => void
}): React.JSX.Element | null {
  const favorites = useScriptFavorites()
  const starred = scripts.filter((script) =>
    isScriptFavorite(script, favorites.data ?? [], projectId)
  )

  if (starred.length === 0) return null

  return (
    <section className="flex flex-col gap-1">
      <h3 className="px-1 text-[11px] font-medium text-muted-foreground">收藏</h3>
      <div className="flex flex-col gap-1">
        {starred.map((script) => (
          <FavoriteAction
            key={script.id}
            projectId={projectId}
            script={script}
            run={runs.find(
              (run) =>
                run.kind === 'script' && run.projectId === projectId && run.scriptId === script.id
            )}
            onError={onError}
            onSettingsOpenChange={onSettingsOpenChange}
          />
        ))}
      </div>
    </section>
  )
}

function FavoriteAction({
  projectId,
  script,
  run,
  onError,
  onSettingsOpenChange
}: {
  projectId: string
  script: Script
  run: Run | undefined
  onError: (error: Error, retry?: () => void) => void
  onSettingsOpenChange?: (open: boolean) => void
}): React.JSX.Element {
  const start = useStartScript()
  const flash = useExitFlash(run)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const active = Boolean(run && run.status !== 'exited')

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
    <>
      <div className="flex items-center gap-0.5">
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-auto min-h-7 min-w-0 flex-1 justify-start bg-background/40 px-2',
            flash === 'ok' && 'border-success/50 bg-success/20',
            flash === 'fail' && 'border-destructive/50 bg-destructive/20'
          )}
          disabled={active || start.isPending}
          aria-label={`运行收藏的脚本 ${script.name}`}
          onClick={() => (script.confirm ? setConfirmOpen(true) : startScript())}
        >
          {(active || start.isPending) && <Loader2 className="animate-spin" />}
          <span className="truncate">{script.name}</span>
        </Button>
        <ScriptSettingsButton
          projectId={projectId}
          script={script}
          compact
          onOpenChange={onSettingsOpenChange}
        />
      </div>
      <ConfirmScriptDialog
        scriptName={script.name}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => startScript()}
      />
    </>
  )
}
