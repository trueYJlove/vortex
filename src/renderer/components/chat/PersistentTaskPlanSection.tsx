import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, Circle, ListTodo, Loader2 } from 'lucide-react'
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
  const [collapsed, setCollapsed] = useState(false)
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

  const activeTodo = hasTodos ? todos.find(todo => todo.status === 'in_progress') : null
  const activeText = activeTodo
    ? activeTodo.activeForm || activeTodo.content
    : hasTodos
      ? stats.completed === stats.total
        ? t('All tasks completed')
        : t('{{count}} pending', { count: stats.pending })
      : t('No task plan')

  return (
    <div className="border-b border-border bg-card/40 flex-shrink-0">
      <button
        onClick={() => setCollapsed(value => !value)}
        title={collapsed ? t('Expand task plan') : t('Collapse task plan')}
        className="w-full px-3 py-2 text-left hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ListTodo size={14} className="text-primary flex-shrink-0" />
          <span className="text-sm font-medium text-foreground flex-1 min-w-0">{t('Task plan')}</span>
          {hasTodos && (
            <span className="text-xs text-muted-foreground tabular-nums">{stats.completed}/{stats.total}</span>
          )}
          <ChevronDown size={14} className={`text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {activeText}
        </div>
      </button>

      {!collapsed && hasTodos && (
        <div className="px-3 pb-3 animate-slide-down">
          <div className="h-1 rounded-full bg-secondary/40 overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-500 ease-out"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
          <div className="mt-2 max-h-48 overflow-y-auto scrollbar-overlay space-y-0.5">
            {todos.map((item, index) => (
              <SidebarTodoRow key={index} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
