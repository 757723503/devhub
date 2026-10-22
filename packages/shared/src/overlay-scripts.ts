import { z } from 'zod'

/**
 * A user's explicit choice to list one script in the floating panel's long-running section.
 * Absent entries fall back to the yaml `overlay` flag.
 */
export const scriptOverlaySchema = z.object({
  projectId: z.string().trim().min(1).max(200),
  scriptId: z.string().trim().min(1).max(200),
  overlay: z.boolean()
})
export type ScriptOverlay = z.infer<typeof scriptOverlaySchema>

/**
 * Whether a script appears in the panel's long-running list. A stored choice wins over
 * `.devhub.yaml`, so a declared script can be removed on this machine and any script can be added.
 */
export function isScriptOnOverlay(
  script: { id: string; overlay?: boolean },
  entries: readonly ScriptOverlay[],
  projectId: string
): boolean {
  const pin = entries.find((item) => item.projectId === projectId && item.scriptId === script.id)
  return pin ? pin.overlay : script.overlay === true
}
