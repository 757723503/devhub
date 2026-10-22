import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ScriptSettingsPatch, ScriptSettingsView } from '@devhub/shared'
import { api } from '@renderer/api'

export function useUpdateScriptSettings(): UseMutationResult<
  ScriptSettingsView,
  Error,
  { projectId: string; scriptId: string; patch: ScriptSettingsPatch }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, scriptId, patch }) =>
      api.updateScriptSettings(projectId, scriptId, patch),
    onSuccess: (_view, input) =>
      queryClient.invalidateQueries({ queryKey: ['projects', input.projectId, 'scripts'] })
  })
}
