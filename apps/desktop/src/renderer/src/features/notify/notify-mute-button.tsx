import { useState } from 'react'
import { SlidersHorizontal, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { useSettings, useUpdateSettings } from '@renderer/features/settings/use-settings'
import { cn } from '@renderer/lib/utils'

/** Sound on/off plus the master volume. Both windows share the same settings. */
export function NotifyMuteButton({ size }: { size: 'icon-xs' | 'icon-sm' }): React.JSX.Element {
  const settings = useSettings()
  const update = useUpdateSettings()
  const enabled = !(settings.data?.notifyMuted ?? false)
  const volume = settings.data?.hookVolume ?? 1
  const label = enabled ? '关闭状态提示音' : '状态提示音已关闭，点击打开'
  return (
    <div className="app-no-drag flex items-center" data-no-drag>
      <Button
        variant="ghost"
        size={size}
        aria-pressed={enabled}
        aria-label={label}
        title={enabled ? '提示音已打开' : '提示音已关闭'}
        onClick={() => update.mutate({ notifyMuted: enabled })}
      >
        {enabled ? (
          <Volume2 absoluteStrokeWidth strokeWidth={2} className="fill-current text-info" />
        ) : (
          <VolumeX
            absoluteStrokeWidth
            strokeWidth={2}
            className="fill-none text-muted-foreground"
          />
        )}
      </Button>
      <VolumePopover
        size={size}
        volume={volume}
        onCommit={(next) => update.mutate({ hookVolume: next })}
      />
    </div>
  )
}

function VolumePopover({
  size,
  volume,
  onCommit
}: {
  size: 'icon-xs' | 'icon-sm'
  volume: number
  onCommit: (value: number) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? volume
  const commit = (raw: number): void => {
    const next = Math.min(1, Math.max(0, Math.round(raw * 20) / 20))
    setDraft(null)
    onCommit(next)
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size={size} aria-label="提示音音量" title="提示音音量">
          <SlidersHorizontal absoluteStrokeWidth strokeWidth={2} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="app-no-drag w-44" data-no-drag>
        <label className="flex items-center gap-2 text-xs" htmlFor="hook-volume">
          <span className="shrink-0">音量</span>
          <input
            id="hook-volume"
            type="range"
            className="app-no-drag h-7 min-w-0 flex-1 accent-primary"
            min={0}
            max={1}
            step={0.05}
            value={shown}
            aria-label="提示音音量"
            onInput={(event) => setDraft(roundVolume(event.currentTarget.value))}
            onPointerUp={(event) => commit(Number(event.currentTarget.value))}
            onKeyUp={(event) => commit(Number(event.currentTarget.value))}
            onBlur={(event) => commit(Number(event.currentTarget.value))}
          />
          <span className={cn('w-8 shrink-0 text-right tabular-nums')}>
            {Math.round(shown * 100)}%
          </span>
        </label>
      </PopoverContent>
    </Popover>
  )
}

function roundVolume(raw: string): number {
  return Math.min(1, Math.max(0, Math.round(Number(raw) * 20) / 20))
}
