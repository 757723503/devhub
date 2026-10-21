import { PanelTop } from 'lucide-react'
import { isScriptOnOverlay, type Script } from '@devhub/shared'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useOverlayScripts, useSetOverlayScript } from './use-overlay-scripts'

export function OverlayListButton({
  projectId,
  script
}: {
  projectId: string
  script: Script
}): React.JSX.Element {
  const entries = useOverlayScripts()
  const setOverlay = useSetOverlayScript()
  const listed = isScriptOnOverlay(script, entries.data ?? [], projectId)
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-pressed={listed}
      aria-label={listed ? `不在悬浮面板显示 ${script.name}` : `在悬浮面板显示 ${script.name}`}
      title={listed ? '从悬浮面板的长期运行列表去掉' : '加入悬浮面板的长期运行列表'}
      disabled={setOverlay.isPending}
      onClick={() => setOverlay.mutate({ projectId, scriptId: script.id, overlay: !listed })}
    >
      <PanelTop
        size={12}
        absoluteStrokeWidth
        strokeWidth={2}
        className={cn(listed ? 'fill-current text-info' : 'fill-none text-muted-foreground')}
      />
    </Button>
  )
}
