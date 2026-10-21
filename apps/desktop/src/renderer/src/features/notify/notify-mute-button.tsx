import { useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { useSettings, useUpdateSettings } from '@renderer/features/settings/use-settings'
import { cn } from '@renderer/lib/utils'

/** Sound on/off and the master volume, in one button. Both windows share settings. */
export function NotifyMuteButton({
  size,
  onOpenChange
}: {
  size: 'icon-xs' | 'icon-sm'
  onOpenChange?: (open: boolean) => void
}): React.JSX.Element {
  const settings = useSettings()
  const update = useUpdateSettings()
  const muted = settings.data?.notifyMuted ?? false
  const volume = settings.data?.hookVolume ?? 1
  const audible = !muted && volume > 0
  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          className="app-no-drag"
          data-no-drag
          aria-pressed={audible}
          aria-label="提示音"
          title={audible ? '提示音已打开' : '提示音已关闭'}
        >
          {audible ? (
            <Volume2 absoluteStrokeWidth strokeWidth={2} className="fill-current text-info" />
          ) : (
            <VolumeX
              absoluteStrokeWidth
              strokeWidth={2}
              className="fill-none text-muted-foreground"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        collisionPadding={8}
        className="app-no-drag w-44 gap-2 p-2"
        data-no-drag
      >
        <VolumeControl
          volume={volume}
          muted={muted}
          onVolume={(next) => update.mutate({ hookVolume: next })}
          onMuted={(next) => update.mutate({ notifyMuted: next })}
        />
      </PopoverContent>
    </Popover>
  )
}

function VolumeControl({
  volume,
  muted,
  onVolume,
  onMuted
}: {
  volume: number
  muted: boolean
  onVolume: (value: number) => void
  onMuted: (muted: boolean) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? volume
  const commit = (raw: number): void => {
    setDraft(null)
    onVolume(roundVolume(raw))
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span>音量</span>
        <span className="tabular-nums">{Math.round(shown * 100)}%</span>
      </div>
      <input
        type="range"
        className="app-no-drag h-7 w-full accent-primary"
        min={0}
        max={1}
        step={0.05}
        value={shown}
        aria-label="提示音音量"
        data-no-drag
        onInput={(event) => setDraft(roundVolume(Number(event.currentTarget.value)))}
        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        onKeyUp={(event) => commit(Number(event.currentTarget.value))}
        onBlur={(event) => commit(Number(event.currentTarget.value))}
      />
      <button
        type="button"
        role="switch"
        aria-checked={muted}
        aria-label="静音"
        data-no-drag
        className="app-no-drag flex h-7 items-center justify-between text-xs"
        onClick={() => onMuted(!muted)}
      >
        <span>静音</span>
        <span
          className={cn(
            'relative h-4 w-7 shrink-0 rounded-full',
            muted ? 'bg-foreground/70' : 'bg-muted-foreground/30'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 size-3 rounded-full bg-background',
              muted ? 'left-3.5' : 'left-0.5'
            )}
          />
        </span>
      </button>
    </div>
  )
}

function roundVolume(raw: number): number {
  return Math.min(1, Math.max(0, Math.round(raw * 20) / 20))
}
