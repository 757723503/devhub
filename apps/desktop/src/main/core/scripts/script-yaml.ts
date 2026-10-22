import { parseDocument } from 'yaml'
import { projectConfigSchema, scriptHooksAreEmpty, type ScriptSettingsPatch } from '@devhub/shared'

/** Rewrites one script entry and leaves command, notify, cwd, and comments on other keys. */
export function updateScriptYaml(
  text: string,
  scriptName: string,
  patch: ScriptSettingsPatch
): string {
  const doc = parseDocument(text)
  const parseError = doc.errors[0]
  if (parseError) {
    throw new Error(`不是有效的 YAML：${parseError.message.split('\n')[0] ?? '无法解析'}`)
  }
  const key = ['scripts', scriptName] as const
  doc.setIn([...key, 'favorite'], patch.favorite)
  doc.setIn([...key, 'overlay'], patch.overlay)
  doc.setIn([...key, 'confirm'], patch.confirm)
  if (patch.status === null) doc.deleteIn([...key, 'status'])
  else doc.setIn([...key, 'status'], patch.status)
  if (scriptHooksAreEmpty(patch.hooks)) doc.deleteIn([...key, 'hooks'])
  else doc.setIn([...key, 'hooks'], patch.hooks.hooks)

  const raw: unknown = doc.toJS()
  const parsed = projectConfigSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue && issue.path.length > 0 ? issue.path.join('.') : '文件'
    throw new Error(`.devhub.yaml 格式不正确：${where} ${issue?.message ?? ''}`.trim())
  }
  return doc.toString()
}
