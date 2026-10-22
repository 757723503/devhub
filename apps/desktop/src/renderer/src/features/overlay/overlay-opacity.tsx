import { useState } from 'react'
import { overlayOpacityMax, overlayOpacityMin } from '@devhub/shared'

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
