import { useMemo } from 'react'
import { CheckCircle2, Circle, ListTodo, Loader2 } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useChatStore } from '../../stores/chat.store'
import { getLatestTodosFromThoughts, getTodoStats, type TodoItem, type TodoStatus } from '../tool/TodoCard'

function getTodoStatusIcon(status: TodoStatus) {
  switch (status) {
    case 'completed':
      return { Icon: CheckCircle2, className: 'text-green-500' }
    case 'in_progress':
      return { Icon: Loader2, className: 'text-primary animate-spin' }
    case 'pending':
      return { Icon: Circle, className: 'text-muted-foreground/50' }
  }
}

function SidebarTodoRow({ item }: { item: TodoItem }) {
  const { Icon, className } = getTodoStatusIcon(item.status)
  const text = item.status === 'in_progress' && item.activeForm ? item.activeForm : item.content

  return (
    <div className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/30 transition-colors">
      <Icon size={13} className={`mt-0.5 flex-shrink-0 ${className}`} />
      <span
        className={`text-xs leading-relaxed ${item.status === 'completed' ? 'text-muted-foreground line-through' : item.status === 'pending' ? 'text-muted-foreground' : 'text-foreground font-medium'}`}
      >
        {text}
      </span>
    </div>
  )
}

export function PersistentTaskPlanSection() {
  const { t } = useTranslation()
  const todos = useChatStore(state => {
    const spaceState = state.spaceStates.get(state.currentSpaceId ?? '')
    const conversationId = spaceState?.currentConversationId
    if (!conversationId) return null

    const sessionTodos = getLatestTodosFromThoughts(state.sessions.get(conversationId)?.thoughts)
    if (sessionTodos?.length) return sessionTodos

    const conversation = state.conversationCache.get(conversationId)
    if (!conversation) return null

    for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
      const messageTodos = getLatestTodosFromThoughts(conversation.messages[index].thoughts)
      if (messageTodos?.length) return messageTodos
    }

    return null
  })

  const stats = useMemo(() => getTodoStats(todos ?? []), [todos])
  const hasTodos = todos && todos.length > 0

  if (!hasTodos) {
    return null
  }

  return (
    <div className="border-b border-border bg-card/40 flex-shrink-0">
      <div className="flex items-center gap-2 px-3 py-2">
        <ListTodo size={14} className="text-primary" />
        <span className="text-sm font-medium">{t('Task plan')}</span>
        {stats && (
          <span className="text-xs text-muted-foreground ml-auto">
            {stats.completed}/{stats.total}
          </span>
        )}
      </div>

      {hasTodos && stats && (
        <>
          <div className="px-3 pb-2">
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${stats.progress}%` }}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto px-3 pb-2">
            {todos.map((item, index) => (
              <SidebarTodoRow key={index} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
