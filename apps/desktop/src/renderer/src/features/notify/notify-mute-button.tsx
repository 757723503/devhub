import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useSettings, useUpdateSettings } from '@renderer/features/settings/use-settings'
import { cn } from '@renderer/lib/utils'

/** Global mute for status sounds. Toasts and callback commands still run. */
export function NotifyMuteButton({ size }: { size: 'icon-xs' | 'icon-sm' }): React.JSX.Element {
  const settings = useSettings()
  const update = useUpdateSettings()
  const muted = settings.data?.notifyMuted ?? false
  const label = muted ? '状态提示音已关闭，点击打开' : '关闭状态提示音'
  return (
    <Button
      variant="ghost"
      size={size}
      className={cn('app-no-drag', muted && 'text-warning')}
      aria-pressed={muted}
      aria-label={label}
      title={label}
      onClick={() => update.mutate({ notifyMuted: !muted })}
    >
      {muted ? <VolumeX /> : <Volume2 />}
    </Button>
  )
}
