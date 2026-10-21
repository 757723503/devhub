import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { DevhubEvent, RunOutputStatus } from '@devhub/shared'
import { api } from '@renderer/api'

const outputStatusKey = ['output-status'] as const

/** Output-matched status of runs that declared rules. Kept current by `run-output-status`. */
export function useOutputStatus(): UseQueryResult<RunOutputStatus[]> {
  return useQuery({ queryKey: outputStatusKey, queryFn: () => api.listOutputStatus() })
}

export function useOutputStatusOf(runId: string | undefined): RunOutputStatus | undefined {
  const { data } = useOutputStatus()
  return runId ? data?.find((status) => status.runId === runId) : undefined
}

export function applyOutputStatusEvent(
  queryClient: QueryClient,
  event: Extract<DevhubEvent, { type: 'run-output-status' }>
): void {
  queryClient.setQueryData<RunOutputStatus[]>(outputStatusKey, (all = []) => {
    const others = all.filter((status) => status.runId !== event.runId)
    return event.status ? [...others, event.status] : others
  })
}
