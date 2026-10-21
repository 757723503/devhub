/**
 * Swaps the registered global shortcut. A failed registration leaves the previous one in place
 * so a typo in settings does not drop the panel shortcut.
 */
export function syncOverlayShortcut(
  current: string | null,
  next: string,
  register: (accelerator: string) => boolean,
  unregister: (accelerator: string) => void
): { active: string | null; failed: boolean } {
  if (current === next) return { active: current, failed: false }
  let ok = false
  try {
    ok = register(next)
  } catch {
    // Registration threw (for example no display). The previous shortcut stays.
  }
  if (!ok) return { active: current, failed: true }
  if (current) {
    try {
      unregister(current)
    } catch {
      // The old accelerator may already have been released.
    }
  }
  return { active: next, failed: false }
}

/** Menu label: `CommandOrControl+Alt+D` is Ctrl+Alt+D on Windows and Linux. */
export function overlayShortcutLabel(accelerator: string, platform: NodeJS.Platform): string {
  const ctrl = platform === 'darwin' ? '⌘' : 'Ctrl'
  return accelerator.replaceAll('CommandOrControl', ctrl).replaceAll('Control', 'Ctrl')
}
