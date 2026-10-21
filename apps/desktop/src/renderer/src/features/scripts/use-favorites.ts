import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { DevhubEvent, ScriptFavorite } from '@devhub/shared'
import { api } from '@renderer/api'

const favoritesKey = ['favorites'] as const

export function useScriptFavorites(): UseQueryResult<ScriptFavorite[]> {
  return useQuery({ queryKey: favoritesKey, queryFn: () => api.listScriptFavorites() })
}

export function applyFavoritesEvent(
  queryClient: QueryClient,
  event: Extract<DevhubEvent, { type: 'favorites-updated' }>
): void {
  queryClient.setQueryData<ScriptFavorite[]>(favoritesKey, event.favorites)
}

export function useSetScriptFavorite(): UseMutationResult<
  ScriptFavorite[],
  Error,
  { projectId: string; scriptId: string; favorite: boolean }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, scriptId, favorite }) =>
      api.setScriptFavorite(projectId, scriptId, favorite),
    onSuccess: (favorites) => queryClient.setQueryData(favoritesKey, favorites)
  })
}
