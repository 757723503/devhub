let resizeHolds = 0
const resumed = new Set<() => void>()

/** Content fitting stays off for the whole pointer capture, including the end IPC. */
export function suspendOverlayFit(): void {
  resizeHolds += 1
}

export function resumeOverlayFit(): void {
  resizeHolds = Math.max(0, resizeHolds - 1)
  if (resizeHolds === 0) {
    for (const listener of resumed) listener()
  }
}

export function overlayFitSuspended(): boolean {
  return resizeHolds > 0
}

export function onOverlayFitResumed(listener: () => void): () => void {
  resumed.add(listener)
  return () => resumed.delete(listener)
}
