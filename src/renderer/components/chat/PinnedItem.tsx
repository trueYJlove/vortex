import { MessageSquare } from 'lucide-react'
import { TaskStatusDot } from '../pulse/TaskStatusDot'
import type { TaskStatus } from '../../types'

interface PinnedItemData {
  id: string
  title: string
  status?: TaskStatus
}

interface PinnedItemProps {
  item: PinnedItemData
  isSelected: boolean
  onClick: () => void
}

export function PinnedItem({ item, isSelected, onClick }: PinnedItemProps) {
  return (
    <div
      onClick={onClick}
      className={`w-full px-3 py-2 text-left hover:bg-secondary/50 transition-colors cursor-pointer flex items-center gap-2 ${
        isSelected ? 'bg-primary/10 border-l-2 border-primary' : ''
      }`}
    >
      <MessageSquare size={14} className="text-primary shrink-0" />
      <span className="flex-1 truncate text-sm">{item.title}</span>
      {item.status && (
        <TaskStatusDot status={item.status} />
      )}
    </div>
  )
}
