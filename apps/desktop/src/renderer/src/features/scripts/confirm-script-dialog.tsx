import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

/** Shown before a script with `confirm: true` (a cloud deploy, for example) actually starts. */
export function ConfirmScriptDialog({
  scriptName,
  open,
  onOpenChange,
  onConfirm
}: {
  scriptName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>确认运行「{scriptName}」？</DialogTitle>
          <DialogDescription>
            这个脚本在配置里要求先确认（例如云端部署）。确认后才会执行。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            运行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
