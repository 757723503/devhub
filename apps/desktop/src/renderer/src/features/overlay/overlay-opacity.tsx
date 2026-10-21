import { useState } from 'react'
import { Blend } from 'lucide-react'
import { overlayOpacityMax, overlayOpacityMin } from '@devhub/shared'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { useUpdateSettings } from '@renderer/features/settings/use-settings'

/** Snaps a slider value onto the 1% grid inside the allowed range. */
function roundOverlayOpacity(value: number): number {
  const clamped = Math.min(overlayOpacityMax, Math.max(overlayOpacityMin, value))
  return Math.round(clamped * 100) / 100
}

export function OverlayOpacitySlider({
  value,
  onPreview,
  onCommit,
  id
}: {
  value: number
  onPreview?: (value: number) => void
  onCommit: (value: number) => void
  id?: string
}): React.JSX.Element {
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? value
  const commit = (raw: number): void => {
    const next = roundOverlayOpacity(raw)
    setDraft(null)
    onCommit(next)
  }
  return (
    <div className="flex w-full max-w-56 min-w-0 items-center gap-2">
      <input
        id={id}
        type="range"
        className="app-no-drag h-7 min-w-0 flex-1 accent-primary"
        min={overlayOpacityMin}
        max={overlayOpacityMax}
        step={0.05}
        value={shown}
        aria-label="悬浮面板不透明度"
        onInput={(event) => {
          const next = roundOverlayOpacity(Number(event.currentTarget.value))
          setDraft(next)
          onPreview?.(next)
        }}
        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        onKeyUp={(event) => commit(Number(event.currentTarget.value))}
        onBlur={() => {
          if (draft !== null) commit(draft)
        }}
      />
      <span className="w-9 shrink-0 text-right text-xs tabular-nums">
        {Math.round(shown * 100)}%
      </span>
    </div>
  )
}

/** Header control on the panel: drag previews immediately, release writes settings. */
export function OverlayOpacityButton({
  opacity,
  onPreview,
  onOpenChange
}: {
  opacity: number
  onPreview: (value: number | null) => void
  onOpenChange?: (open: boolean) => void
}): React.JSX.Element {
  const update = useUpdateSettings()
  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="app-no-drag"
          aria-label="不透明度"
          title="不透明度"
        >
          <Blend />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 gap-1.5 p-2">
        <p className="text-xs font-medium">不透明度</p>
        <OverlayOpacitySlider
          value={opacity}
          onPreview={onPreview}
          onCommit={(value) => {
            onPreview(value)
            update.mutate({ overlayOpacity: value }, { onSettled: () => onPreview(null) })
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
