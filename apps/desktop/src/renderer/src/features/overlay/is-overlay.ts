/** The floating panel loads the same renderer with `?view=overlay`. */
export function isOverlayView(): boolean {
  return new URLSearchParams(window.location.search).get('view') === 'overlay'
}
