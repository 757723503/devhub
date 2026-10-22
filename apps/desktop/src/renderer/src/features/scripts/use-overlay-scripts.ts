import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { DevhubEvent, ScriptOverlay } from '@devhub/shared'
import { api } from '@renderer/api'

const overlayScriptsKey = ['overlay-scripts'] as const

export function useOverlayScripts(): UseQueryResult<ScriptOverlay[]> {
  return useQuery({ queryKey: overlayScriptsKey, queryFn: () => api.listOverlayScripts() })
}

export function applyOverlayScriptsEvent(
  queryClient: QueryClient,
  event: Extract<DevhubEvent, { type: 'overlay-scripts-updated' }>
): void {
  queryClient.setQueryData<ScriptOverlay[]>(overlayScriptsKey, event.scripts)
}

export function useSetOverlayScript(): UseMutationResult<
  ScriptOverlay[],
  Error,
  { projectId: string; scriptId: string; overlay: boolean }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, scriptId, overlay }) =>
      api.setOverlayScript(projectId, scriptId, overlay),
    onSuccess: (scripts) => queryClient.setQueryData(overlayScriptsKey, scripts)
  })
}
