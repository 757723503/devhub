import { Star } from 'lucide-react'
import { isScriptFavorite, type Script } from '@devhub/shared'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useScriptFavorites, useSetScriptFavorite } from './use-favorites'

export function FavoriteButton({
  projectId,
  script
}: {
  projectId: string
  script: Script
}): React.JSX.Element {
  const favorites = useScriptFavorites()
  const setFavorite = useSetScriptFavorite()
  const starred = isScriptFavorite(script, favorites.data ?? [], projectId)
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-pressed={starred}
      aria-label={starred ? `取消收藏 ${script.name}` : `收藏 ${script.name}`}
      title={starred ? '取消收藏' : '收藏：出现在悬浮面板底部'}
      disabled={setFavorite.isPending}
      onClick={() => setFavorite.mutate({ projectId, scriptId: script.id, favorite: !starred })}
    >
      <Star className={cn(starred && 'fill-current text-warning')} />
    </Button>
  )
}
