import { useState } from 'react'
import {
  hooksDocumentSchema,
  type HookEventName,
  type HooksDocument,
  type Settings,
  type SettingsPatch
} from '@devhub/shared'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { SettingsSection } from './settings-controls'

const example = `{
  "hooks": {
    "onReady": [
      {
        "match": { "project": "axe_king", "script": "全量dev" },
        "actions": [
          { "type": "sound", "file": "default" },
          { "type": "toast" },
          { "type": "command", "command": "yarn launch axe_king s1-1", "cwd": "project" }
        ]
      }
    ]
  }
}`

const trials: { event: HookEventName; label: string }[] = [
  { event: 'onReady', label: '试触发构建就绪' },
  { event: 'onError', label: '试触发构建出错' },
  { event: 'onStart', label: '试触发进程启动' },
  { event: 'onExit', label: '试触发进程退出' }
]

function explain(text: string): { value?: HooksDocument; error?: string } {
  if (text.length > 100_000) return { error: '内容过长' }
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: `不是有效的 JSON：${message}` }
  }
  const parsed = hooksDocumentSchema.safeParse(raw)
  if (!parsed.success) {
    const lines = parsed.error.issues.slice(0, 4).map((issue) => {
      const where = issue.path.length ? issue.path.join('.') : '文件'
      return `${where}：${issue.message}`
    })
    return { error: lines.join('\n') }
  }
  return { value: parsed.data }
}

/** Global hooks, edited as JSON. Project files and `notify` are merged in when an event fires. */
export function HooksSection({
  settings,
  save
}: {
  settings: Settings
  save: (patch: SettingsPatch) => void
}): React.JSX.Element {
  const savedText = JSON.stringify(settings.hooks, null, 2)
  return <HooksEditor key={savedText} savedText={savedText} save={save} />
}

function HooksEditor({
  savedText,
  save
}: {
  savedText: string
  save: (patch: SettingsPatch) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(savedText)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<HookEventName | null>(null)
  const parsed = explain(draft)
  const dirty = draft !== savedText

  const submit = (): void => {
    if (!parsed.value) return
    setNotice(null)
    save({ hooks: parsed.value })
  }

  const fire = (event: HookEventName): void => {
    setPending(event)
    setNotice(null)
    void api
      .testHook(event)
      .then(({ fired }) =>
        setNotice(fired === 0 ? '这个事件没有已保存的动作' : `已触发 ${fired} 个动作`)
      )
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)))
      .finally(() => setPending(null))
  }

  return (
    <SettingsSection title="Hooks">
      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          构建就绪（构建中变为就绪）、构建出错、进程启动、进程退出都可以挂动作。
          <code className="mx-1">match.project</code>
          是项目名，
          <code className="mx-1">match.script</code>
          是脚本名，省略则全部匹配。同一规则默认至少隔 15 秒再触发，
          <code className="mx-1">interval: 0</code>
          为不限制；
          <code className="mx-1">firstBuild: false</code>
          跳过这次启动后的第一次就绪。命令在项目目录执行，标准输入是事件 JSON，并带有
          DEVHUB_EVENT、DEVHUB_PROJECT、DEVHUB_SCRIPT、DEVHUB_STATUS、DEVHUB_EXIT_CODE，默认 30
          秒后结束进程树。
          <code className="mx-1">.devhub.yaml</code>
          根上的 hooks 会并进来。脚本上的 notify 仍可用，相当于这个脚本的就绪和出错。
        </p>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">示例</summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 font-mono">{example}</pre>
        </details>
        <textarea
          id="settings-hooks"
          aria-label="Hooks JSON"
          aria-invalid={parsed.error ? true : undefined}
          spellCheck={false}
          className="min-h-48 w-full rounded-lg border bg-transparent p-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {parsed.error && (
          <p role="alert" className="whitespace-pre-wrap text-xs text-destructive">
            {parsed.error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={!dirty || !parsed.value} onClick={submit}>
            保存
          </Button>
          {trials.map((trial) => (
            <Button
              key={trial.event}
              type="button"
              size="sm"
              variant="outline"
              disabled={dirty || pending !== null}
              onClick={() => fire(trial.event)}
            >
              {trial.label}
            </Button>
          ))}
        </div>
        {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      </div>
    </SettingsSection>
  )
}
