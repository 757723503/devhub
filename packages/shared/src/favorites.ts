import { z } from 'zod'

/** A user's explicit star for one script. Absent entries fall back to the yaml `favorite` flag. */
export const scriptFavoriteSchema = z.object({
  projectId: z.string().trim().min(1).max(200),
  scriptId: z.string().trim().min(1).max(200),
  favorite: z.boolean()
})
export type ScriptFavorite = z.infer<typeof scriptFavoriteSchema>

/**
 * Whether a script is starred. A stored choice wins over `.devhub.yaml`, so a declared
 * favorite can be turned off on this machine and a detected script can be starred.
 */
export function isScriptFavorite(
  script: { id: string; favorite?: boolean },
  favorites: readonly ScriptFavorite[],
  projectId: string
): boolean {
  const pin = favorites.find((item) => item.projectId === projectId && item.scriptId === script.id)
  return pin ? pin.favorite : script.favorite === true
}
