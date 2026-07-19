/**
 * PersistentTaskPlanPanel - Always-mounted task plan panel in the right sidebar.
 * Shows empty state when no todos, full task plan when todos exist.
 * Supports drag-to-resize height with persistence.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { ListTodo, ChevronDown } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useTodos } from '../../hooks/useTodos'
import { PersistentTaskPlanSection } from './PersistentTaskPlanSection'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'

const MIN_HEIGHT = 120
const MAX_HEIGHT = 600
const DEFAULT_HEIGHT = 320
/** Minimum vertical space reserved for Sessions area (header + some items) */
const SESSIONS_MINIMUM = 80

export function PersistentTaskPlanPanel() {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(true)
  const todos = useTodos()
  const hasTodos = todos !== null && todos.length > 0

  // Resizable height — initialized from persisted config
  const layoutConfig = useAppStore(state => state.config?.layout)
  const [height, setHeight] = useState(layoutConfig?.taskPlanHeight ?? DEFAULT_HEIGHT)
  const [isDragging, setIsDragging] = useState(false)
  const heightRef = useRef(height)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  /** Clamp height to [MIN_HEIGHT, MAX_HEIGHT] and prevent squeezing out Sessions */
  const clampHeight = useCallback((raw: number): number => {
    const clamped = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, raw))
    // If we have a reference to the content section parent, limit max height
    // to leave room for the Sessions header + minimum content area
    if (containerRef.current) {
      const contentParent = containerRef.current.parentElement
      if (contentParent) {
        const available = contentParent.clientHeight
        const maxAllowed = Math.max(MIN_HEIGHT, available - SESSIONS_MINIMUM)
        return Math.min(clamped, maxAllowed)
      }
    }
    return clamped
  }, [])

  // Sync persisted height when config arrives asynchronously
  useEffect(() => {
    if (layoutConfig?.taskPlanHeight !== undefined && !isDragging) {
      setHeight(clampHeight(layoutConfig.taskPlanHeight))
      heightRef.current = clampHeight(layoutConfig.taskPlanHeight)
    }
  }, [layoutConfig?.taskPlanHeight, isDragging, clampHeight])

  // Reclamp on container resize (window resize, top panels expand/collapse)
  // Also reclamp immediately on expand to handle container changes since collapse
  useEffect(() => {
    if (!containerRef.current || !isExpanded) return

    // Immediate reclamp on expand
    setHeight(prev => clampHeight(prev))
    heightRef.current = clampHeight(heightRef.current)

    const parent = containerRef.current.parentElement
    if (!parent) return

    const observer = new ResizeObserver(() => {
      setHeight(prev => clampHeight(prev))
      heightRef.current = clampHeight(heightRef.current)
    })
    observer.observe(parent)

    return () => observer.disconnect()
  }, [isExpanded, clampHeight])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    startYRef.current = e.clientY
    startHeightRef.current = heightRef.current
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      // Drag up = larger task plan (cursor delta is negative when moving up)
      const delta = startYRef.current - e.clientY
      const newHeight = clampHeight(startHeightRef.current + delta)
      setHeight(newHeight)
      heightRef.current = newHeight
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      const currentConfig = useAppStore.getState().config
      if (currentConfig) {
        useAppStore.getState().updateConfig({ layout: { ...currentConfig.layout, taskPlanHeight: heightRef.current } })
      }
      api.setConfig({ layout: { taskPlanHeight: heightRef.current } }).catch(err =>
        console.error('[PersistentTaskPlanPanel] Failed to persist height:', err)
      )
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  return (
    <div
      ref={containerRef}
      className={`border-t border-border flex-shrink-0 flex flex-col ${isDragging ? '' : 'transition-[height] duration-100'}`}
      style={{ height: isExpanded ? height : 'auto' }}
    >
      {/* Drag handle — visible at the top border between Sessions and TaskPlan */}
      <div
        onMouseDown={handleMouseDown}
        className={`h-1.5 -mt-px cursor-row-resize hover:bg-primary/50 transition-colors shrink-0 ${
          isDragging ? 'bg-primary/50' : ''
        }`}
        title={t('Drag to resize task plan')}
      />

      {/* Title row */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors shrink-0"
      >
        <span className="text-muted-foreground">
          <ListTodo size={14} />
        </span>
        <span className="text-sm sm:text-[14px] font-semibold text-muted-foreground flex-1 text-left">
          {t('Task plan')}
        </span>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`}
        />
      </button>

      {/* Content area — fills remaining height, scrolls when overflow */}
      {isExpanded && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {hasTodos ? (
            <PersistentTaskPlanSection embedded disableMaxHeight />
          ) : (
            <div className="px-3 pb-3">
              <p className="text-xs text-muted-foreground/60">
                {t('Task plan will appear here')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
