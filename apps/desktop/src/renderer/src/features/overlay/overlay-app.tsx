import { useEffect, useState } from 'react'
import { Pin, SquareArrowOutUpRight, TriangleAlert, X } from 'lucide-react'
import { defaultOverlayOpacity } from '@devhub/shared'
import { shell } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { useProjects } from '@renderer/features/projects/use-projects'
import { useSettings, useSettingsSync } from '@renderer/features/settings/use-settings'
import { useRuns } from '@renderer/features/runs/use-runs'
import { useRunEventsSync } from '@renderer/features/runs/use-runs'
import { useProjectScripts } from '@renderer/features/scripts/use-scripts'
import { useWorkspaceEventsSync } from '@renderer/features/workspaces/use-workspaces'
import { OverlayFavorites } from './overlay-favorites'
import { OverlayOpacityButton } from './overlay-opacity'
import { OverlayRuns } from './overlay-runs'

const projectKey = 'devhub.overlayProjectId'

/** Painted opacity, including a drag that has not been saved yet. */
function useOverlayOpacityPreview(): {
  opacity: number
  preview: (value: number | null) => void
} {
  const settings = useSettings()
  const [preview, setPreview] = useState<number | null>(null)
  return {
    opacity: preview ?? settings.data?.overlayOpacity ?? defaultOverlayOpacity,
    preview: setPreview
  }
}

export function OverlayApp(): React.JSX.Element {
  useRunEventsSync()
  useSettingsSync()
  useWorkspaceEventsSync()
  const panel = useOverlayOpacityPreview()
  const projects = useProjects()
  const [projectId, setProjectId] = useState<string | null>(() => localStorage.getItem(projectKey))
  const [runError, setRunError] = useState<{ error: Error; retry?: () => void } | null>(null)
  const selected =
    projects.data?.find((project) => project.id === projectId) ?? projects.data?.[0] ?? null

  useEffect(() => {
    if (selected) localStorage.setItem(projectKey, selected.id)
  }, [selected])

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden rounded-2xl border border-foreground/15 bg-background/85 text-foreground shadow-none backdrop-blur-md"
      style={{ opacity: panel.opacity }}
    >
      <header className="app-drag flex items-center gap-1 border-b border-foreground/10 px-2 py-1.5">
        <select
          className="app-no-drag h-7 min-w-0 flex-1 truncate rounded-md border bg-background/70 px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="当前项目"
          value={selected?.id ?? ''}
          onChange={(event) => {
            setProjectId(event.target.value)
            setRunError(null)
          }}
        >
          {(projects.data ?? []).map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <OverlayOpacityButton opacity={panel.opacity} onPreview={panel.preview} />
        <PinButton />
        <Button
          variant="ghost"
          size="icon-xs"
          className="app-no-drag"
          aria-label="打开主窗口"
          title="打开主窗口"
          onClick={() => void shell?.showMainWindow()}
        >
          <SquareArrowOutUpRight />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="app-no-drag"
          aria-label="隐藏悬浮面板"
          title="隐藏"
          onClick={() => void shell?.hideOverlay()}
        >
          <X />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1.5 py-1.5">
        {!selected && (
          <p className="px-1 text-xs text-muted-foreground">还没有项目。请先在主窗口添加。</p>
        )}
        {runError && (
          <div className="flex items-start gap-1 rounded-md bg-destructive/15 px-1.5 py-1 text-[11px] text-destructive">
            <TriangleAlert className="mt-0.5 size-3 shrink-0" />
            <p className="min-w-0 flex-1">{runError.error.message}</p>
            {runError.retry && (
              <button
                type="button"
                className="app-no-drag shrink-0 underline"
                onClick={() => {
                  runError.retry?.()
                  setRunError(null)
                }}
              >
                仍然启动
              </button>
            )}
            <button
              type="button"
              className="app-no-drag shrink-0"
              aria-label="关闭"
              onClick={() => setRunError(null)}
            >
              <X className="size-3" />
            </button>
          </div>
        )}
        {selected && (
          <OverlayBody
            projectId={selected.id}
            onError={(error, retry) => setRunError({ error, retry })}
          />
        )}
      </div>
    </div>
  )
}

function OverlayBody({
  projectId,
  onError
}: {
  projectId: string
  onError: (error: Error, retry?: () => void) => void
}): React.JSX.Element {
  const scripts = useProjectScripts(projectId)
  const runs = useRuns()
  const items = scripts.data?.status === 'ok' ? scripts.data.scripts : []
  return (
    <>
      <OverlayRuns projectId={projectId} scripts={items} runs={runs.data ?? []} onError={onError} />
      <OverlayFavorites
        projectId={projectId}
        scripts={items}
        runs={runs.data ?? []}
        onError={onError}
      />
    </>
  )
}

function PinButton(): React.JSX.Element {
  const [pinned, setPinned] = useState(true)
  useEffect(() => {
    void shell?.getOverlayState().then((state) => setPinned(state.alwaysOnTop))
  }, [])
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="app-no-drag"
      aria-pressed={pinned}
      aria-label={pinned ? '取消置顶' : '置顶'}
      title={pinned ? '取消置顶' : '保持在最前'}
      onClick={() => {
        const next = !pinned
        setPinned(next)
        void shell?.setOverlayPinned(next)
      }}
    >
      <Pin className={pinned ? 'fill-current' : undefined} />
    </Button>
  )
}
