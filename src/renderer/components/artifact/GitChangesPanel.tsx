import { useState, useRef, useCallback, useEffect } from 'react'
import { GitBranch, ChevronDown } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useGitStatus } from '../../hooks/useGitStatus'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import type { GitFileStatus } from '../../../shared/rpc/contracts/git.contract'

const MIN_HEIGHT = 120
const MAX_HEIGHT = 600
const DEFAULT_HEIGHT = 320

const STATUS_LABELS: Record<GitFileStatus['status'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: '?',
}

const STATUS_COLORS: Record<GitFileStatus['status'], string> = {
  modified: 'text-yellow-500',
  added: 'text-green-500',
  deleted: 'text-red-500',
  renamed: 'text-blue-500',
  untracked: 'text-muted-foreground',
}

interface GitChangesPanelProps {
  spaceId: string
  onFileClick?: (file: GitFileStatus) => void
}

export function GitChangesPanel({ spaceId, onFileClick }: GitChangesPanelProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(true)
  const { files, isEmpty, loading } = useGitStatus(spaceId)

  // Resizable height — initialized from persisted config
  const layoutConfig = useAppStore(state => state.config?.layout)
  const [height, setHeight] = useState(layoutConfig?.gitChangesHeight ?? DEFAULT_HEIGHT)
  const [isDragging, setIsDragging] = useState(false)
  const heightRef = useRef(height)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)

  // Sync persisted height when config arrives asynchronously
  useEffect(() => {
    if (layoutConfig?.gitChangesHeight !== undefined && !isDragging) {
      const clamped = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, layoutConfig.gitChangesHeight))
      setHeight(clamped)
      heightRef.current = clamped
    }
  }, [layoutConfig?.gitChangesHeight, isDragging])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    startYRef.current = e.clientY
    startHeightRef.current = heightRef.current
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startYRef.current - e.clientY
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeightRef.current + delta))
      setHeight(newHeight)
      heightRef.current = newHeight
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      const currentConfig = useAppStore.getState().config
      if (currentConfig) {
        useAppStore.getState().updateConfig({ layout: { ...currentConfig.layout, gitChangesHeight: heightRef.current } })
      }
      api.setConfig({ layout: { gitChangesHeight: heightRef.current } }).catch(err =>
        console.error('[GitChangesPanel] Failed to persist height:', err)
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
      className={`border-t border-border flex-shrink-0 flex flex-col ${isDragging ? '' : 'transition-[height] duration-100'}`}
      style={{ height: isExpanded ? height : 'auto' }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`h-1.5 -mt-px cursor-row-resize hover:bg-primary/50 transition-colors shrink-0 ${
          isDragging ? 'bg-primary/50' : ''
        }`}
        title={t('Drag to resize')}
      />

      {/* Title row */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors shrink-0"
      >
        <span className="text-muted-foreground">
          <GitBranch size={14} />
        </span>
        <span className="text-sm font-medium text-muted-foreground flex-1 text-left">
          {t('Changed files')} ({files.length})
        </span>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`}
        />
      </button>

      {/* Content area */}
      {isExpanded && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="px-3 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <p className="text-xs text-muted-foreground/60">
                  {t('Loading...')}
                </p>
              </div>
            </div>
          ) : isEmpty ? (
            <div className="px-3 pb-3">
              <p className="text-xs text-muted-foreground/60">
                {t('No uncommitted changes')}
              </p>
            </div>
          ) : (
            <div className="px-2 pb-2">
              {files.map((file, index) => (
                <button
                  key={`${file.relativePath}-${index}`}
                  onClick={() => onFileClick?.(file)}
                  className="w-full flex items-center gap-2 px-1 py-0.5 hover:bg-secondary/60 rounded text-left transition-colors"
                >
                  <span className={`text-xs font-mono w-4 text-center ${STATUS_COLORS[file.status]}`}>
                    {STATUS_LABELS[file.status]}
                  </span>
                  <span className="text-xs text-foreground truncate" title={file.relativePath}>
                    {file.relativePath}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
