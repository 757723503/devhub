import { z } from 'zod'
import { scriptSourceSchema } from './domain'
import { scriptHooksDocumentSchema } from './hooks'
import { outputStatusConfigSchema } from './output-status'

/**
 * What the script gear saves into `.devhub.yaml`.
 * `status: null` removes the key. An empty hooks document removes `hooks`.
 */
export const scriptSettingsPatchSchema = z
  .object({
    favorite: z.boolean(),
    overlay: z.boolean(),
    confirm: z.boolean(),
    status: outputStatusConfigSchema.nullable(),
    hooks: scriptHooksDocumentSchema
  })
  .strict()
export type ScriptSettingsPatch = z.infer<typeof scriptSettingsPatchSchema>

/** Effective flags plus the yaml source the gear edits. */
export const scriptSettingsViewSchema = scriptSettingsPatchSchema.extend({
  name: z.string().min(1),
  source: scriptSourceSchema,
  /** True when the script entry still has the legacy `notify` shorthand. */
  hasNotify: z.boolean()
})
export type ScriptSettingsView = z.infer<typeof scriptSettingsViewSchema>
