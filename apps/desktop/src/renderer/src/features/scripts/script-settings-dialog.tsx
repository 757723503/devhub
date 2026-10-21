import { useEffect, useState } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import {
  emptyScriptHooksDocument,
  outputStatusConfigSchema,
  scriptHooksDocumentSchema,
  type HookEventName,
  type OutputStatusConfig,
  type Script,
  type ScriptHooksDocument,
  type ScriptSettingsView
} from '@devhub/shared'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@renderer/components/ui/dialog'
import { useUpdateScriptSettings } from './use-script-settings'

const trials: { event: HookEventName; label: string }[] = [
  { event: 'onReady', label: '试触发构建就绪' },
  { event: 'onError', label: '试触发构建出错' },
  { event: 'onStart', label: '试触发进程启动' },
  { event: 'onExit', label: '试触发进程退出' }
]

const hooksExample = `{
  "hooks": {
    "onReady": [
      {
        "actions": [
          { "type": "sound", "file": "default" },
          { "type": "toast" },
          { "type": "command", "command": "yarn launch axe_king s1-1", "cwd": "project" }
        ]
      }
    ]
  }
}`

function formatIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .slice(0, 4)
    .map((issue) => {
      const where = issue.path.length ? issue.path.join('.') : '文件'
      return `${where}：${issue.message}`
    })
    .join('\n')
}

function readJson(text: string): { raw?: unknown; error?: string } {
  if (text.length > 100_000) return { error: '内容过长' }
  try {
    return { raw: JSON.parse(text) as unknown }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: `不是有效的 JSON：${message}` }
  }
}

function explainStatus(text: string): { value?: OutputStatusConfig | null; error?: string } {
  if (text.trim() === '') return { value: null }
  const json = readJson(text)
  if (json.error) return { error: json.error }
  const parsed = outputStatusConfigSchema.safeParse(json.raw)
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) }
  return { value: parsed.data }
}

function explainHooks(text: string): { value?: ScriptHooksDocument; error?: string } {
  const json = readJson(text)
  if (json.error) return { error: json.error }
  const parsed = scriptHooksDocumentSchema.safeParse(json.raw)
  if (!parsed.success) return { error: formatIssues(parsed.error.issues) }
  return { value: parsed.data }
}

function statusText(status: OutputStatusConfig | null): string {
  return status === null ? '' : JSON.stringify(status, null, 2)
}

function FlagBox({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        className="app-no-drag"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

/** Gear on a script row. Opens settings for that project and script name. */
export function ScriptSettingsButton({
  projectId,
  script,
  compact = false,
  onOpenChange
}: {
  projectId: string
  script: Script
  compact?: boolean
  onOpenChange?: (open: boolean) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        onOpenChange?.(next)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="app-no-drag"
          data-no-drag
          aria-label={`${script.name} 的设置`}
          title="脚本设置"
        >
          <SettingsIcon absoluteStrokeWidth strokeWidth={2} />
        </Button>
      </DialogTrigger>
      <ScriptSettingsDialog open={open} projectId={projectId} script={script} compact={compact} />
    </Dialog>
  )
}

function ScriptSettingsDialog({
  open,
  projectId,
  script,
  compact
}: {
  open: boolean
  projectId: string
  script: Script
  compact: boolean
}): React.JSX.Element {
  return (
    <DialogContent
      data-no-drag
      className={
        compact
          ? 'app-no-drag max-h-[calc(100dvh-1rem)] w-[min(28rem,calc(100%-1rem))] max-w-none overflow-y-auto sm:max-w-none'
          : 'max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg'
      }
    >
      <DialogHeader>
        <DialogTitle>{script.name} 的设置</DialogTitle>
        <DialogDescription>
          写入这个项目的 .devhub.yaml，会跟着项目走。设置页的 Hooks 仍然管跨项目的规则。
        </DialogDescription>
      </DialogHeader>
      {open ? <ScriptSettingsForm projectId={projectId} script={script} /> : null}
    </DialogContent>
  )
}

function ScriptSettingsForm({
  projectId,
  script
}: {
  projectId: string
  script: Script
}): React.JSX.Element {
  const saveSettings = useUpdateScriptSettings()
  const [view, setView] = useState<ScriptSettingsView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [favorite, setFavorite] = useState(false)
  const [overlay, setOverlay] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [statusDraft, setStatusDraft] = useState('')
  const [hooksDraft, setHooksDraft] = useState(JSON.stringify(emptyScriptHooksDocument, null, 2))
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<HookEventName | null>(null)

  useEffect(() => {
    let cancelled = false
    void api.getScriptSettings(projectId, script.id).then(
      (next) => {
        if (cancelled) return
        setView(next)
        setFavorite(next.favorite)
        setOverlay(next.overlay)
        setConfirm(next.confirm)
        setStatusDraft(statusText(next.status))
        setHooksDraft(JSON.stringify(next.hooks, null, 2))
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error))
      }
    )
    return () => {
      cancelled = true
    }
  }, [projectId, script.id])

  const savedStatus = view ? statusText(view.status) : ''
  const savedHooks = view ? JSON.stringify(view.hooks, null, 2) : hooksDraft
  const status = explainStatus(statusDraft)
  const hooks = explainHooks(hooksDraft)
  const dirty =
    view !== null &&
    (favorite !== view.favorite ||
      overlay !== view.overlay ||
      confirm !== view.confirm ||
      statusDraft !== savedStatus ||
      hooksDraft !== savedHooks)
  const hooksDirty = hooksDraft !== savedHooks

  const applyView = (next: ScriptSettingsView): void => {
    setView(next)
    setFavorite(next.favorite)
    setOverlay(next.overlay)
    setConfirm(next.confirm)
    setStatusDraft(statusText(next.status))
    setHooksDraft(JSON.stringify(next.hooks, null, 2))
  }

  const submit = (): void => {
    if (!status.value && status.value !== null) return
    if (!hooks.value) return
    setNotice(null)
    saveSettings.mutate(
      {
        projectId,
        scriptId: script.id,
        patch: {
          favorite,
          overlay,
          confirm,
          status: status.value,
          hooks: hooks.value
        }
      },
      {
        onSuccess: (next) => {
          applyView(next)
          setNotice('已保存')
        },
        onError: (error) => setNotice(error.message)
      }
    )
  }

  const fire = (event: HookEventName): void => {
    setPending(event)
    setNotice(null)
    void api
      .testScriptHook(projectId, script.id, event)
      .then(({ fired }) =>
        setNotice(fired === 0 ? '这个事件没有已保存的动作' : `已触发 ${fired} 个动作`)
      )
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)))
      .finally(() => setPending(null))
  }

  if (loadError) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {loadError}
      </p>
    )
  }
  if (!view) return <p className="text-xs text-muted-foreground">正在读取…</p>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <FlagBox label="收藏" checked={favorite} onChange={setFavorite} />
        <FlagBox label="长期运行" checked={overlay} onChange={setOverlay} />
        <FlagBox label="运行前确认" checked={confirm} onChange={setConfirm} />
      </div>
      <label className="flex flex-col gap-1 text-xs">
        输出状态
        <textarea
          aria-label="输出状态 JSON"
          spellCheck={false}
          placeholder='"webpack"'
          className="app-no-drag min-h-16 w-full rounded-lg border bg-transparent p-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={statusDraft}
          onChange={(event) => setStatusDraft(event.target.value)}
        />
      </label>
      {status.error && (
        <p role="alert" className="whitespace-pre-wrap text-xs text-destructive">
          {status.error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        留空表示不按输出判断。可以写 <code>&quot;webpack&quot;</code>、<code>&quot;tstl&quot;</code>
        ，或 busy / ready / error 正则。
      </p>
      <p className="text-xs text-muted-foreground">
        钩子不必写 match，保存后只对「{script.name}」生效。间隔默认 15 秒，0 为不限制。
      </p>
      <label className="flex flex-col gap-1 text-xs">
        Hooks
        <textarea
          aria-label="脚本 Hooks JSON"
          aria-invalid={hooks.error ? true : undefined}
          spellCheck={false}
          className="app-no-drag min-h-36 w-full rounded-lg border bg-transparent p-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={hooksDraft}
          onChange={(event) => setHooksDraft(event.target.value)}
        />
      </label>
      {hooks.error && (
        <p role="alert" className="whitespace-pre-wrap text-xs text-destructive">
          {hooks.error}
        </p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">示例</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 font-mono">{hooksExample}</pre>
      </details>
      {view.hasNotify && (
        <p className="text-xs text-muted-foreground">
          这个脚本还有 notify 简写，会在上面的钩子之后执行。
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!dirty || Boolean(status.error) || !hooks.value || saveSettings.isPending}
          onClick={submit}
        >
          保存
        </Button>
        {trials.map((trial) => (
          <Button
            key={trial.event}
            type="button"
            size="sm"
            variant="outline"
            disabled={hooksDirty || Boolean(hooks.error) || pending !== null}
            onClick={() => fire(trial.event)}
          >
            {trial.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        试触发只跑这个脚本已保存的钩子和 notify，忽略间隔。全局和项目根上的钩子不在这里试。
      </p>
      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
    </div>
  )
}
