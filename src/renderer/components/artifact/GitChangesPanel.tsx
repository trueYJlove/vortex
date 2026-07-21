import { useState, useRef, useCallback, useEffect } from 'react'
import { GitBranch, ChevronDown, X, Copy, FolderOpen } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useGitStatus } from '../../hooks/useGitStatus'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'
import { copyToClipboard } from '../../utils/clipboard'
import type { GitFileStatus } from '../../../shared/rpc/contracts/git.contract'

const isWebMode = api.isRemoteMode()

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
  const { files, isEmpty, loading, gitAvailable } = useGitStatus(spaceId)

  // Diff modal state
  const [selectedFile, setSelectedFile] = useState<GitFileStatus | null>(null)
  const [diffContent, setDiffContent] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSingleClick = useCallback((file: GitFileStatus) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
    }
    clickTimerRef.current = setTimeout(() => {
      onFileClick?.(file)
      clickTimerRef.current = null
    }, 180)
  }, [onFileClick])

  const handleDoubleClick = useCallback(async (file: GitFileStatus) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    if (!gitAvailable) return

    setSelectedFile(file)
    setDiffLoading(true)
    setDiffError(null)
    setDiffContent('')

    try {
      const result = await api.gitDiff(spaceId, file.relativePath)
      if (result.success && result.data) {
        setDiffContent(result.data.diff)
      } else {
        setDiffError(result.error || t('Failed to load diff'))
      }
    } catch (err) {
      setDiffError(t('Failed to load diff'))
    } finally {
      setDiffLoading(false)
    }
  }, [spaceId, gitAvailable, t])

  const handleCloseDiff = useCallback(() => {
    setSelectedFile(null)
    setDiffContent('')
    setDiffError(null)
  }, [])

  const buildFileMenuItems = useCallback((file: GitFileStatus): ContextMenuItem[] => [
    {
      label: t('Copy relative path'),
      icon: <Copy className="w-4 h-4" />,
      onClick: () => {
        copyToClipboard(file.relativePath).catch(err =>
          console.error('[GitChangesPanel] Failed to copy relative path:', err)
        )
      }
    },
    {
      label: t('Show in Folder'),
      icon: <FolderOpen className="w-4 h-4" />,
      onClick: () => {
        api.showArtifactInFolder(file.path).catch(err =>
          console.error('[GitChangesPanel] Failed to show in folder:', err)
        )
      },
      hidden: isWebMode
    }
  ], [t])

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
        <span className="text-sm font-semibold text-muted-foreground flex-1 text-left">
          {t('Changed files')} ({files.length})
          <span className="text-xs text-muted-foreground/60 ml-2">
            ({t('requires git')})
          </span>
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
                {gitAvailable ? t('No uncommitted changes') : t('Git is not installed')}
              </p>
            </div>
          ) : (
            <div className="px-2 pb-2">
              {files.map((file, index) => (
                <ContextMenu key={`${file.relativePath}-${index}`} items={buildFileMenuItems(file)}>
                  <button
                    onClick={() => handleSingleClick(file)}
                    onDoubleClick={() => handleDoubleClick(file)}
                    className="w-full flex items-center gap-2 px-1 py-0.5 hover:bg-secondary/60 rounded text-left transition-colors"
                    title={gitAvailable ? t('Double-click to view diff') : t('Git is not installed')}
                  >
                    <span className={`text-xs font-mono w-4 text-center ${STATUS_COLORS[file.status]}`}>
                      {STATUS_LABELS[file.status]}
                    </span>
                    <span className="text-xs text-foreground truncate flex-1" title={file.relativePath}>
                      {file.relativePath}
                    </span>
                    {(file.insertions != null || file.deletions != null) && (
                      <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                        {file.insertions != null && file.insertions > 0 && (
                          <span className="text-green-500">+{file.insertions}</span>
                        )}
                        {file.deletions != null && file.deletions > 0 && (
                          <span className="text-red-500 ml-1">-{file.deletions}</span>
                        )}
                      </span>
                    )}
                  </button>
                </ContextMenu>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Diff Modal */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-mono ${STATUS_COLORS[selectedFile.status]}`}>
                  {STATUS_LABELS[selectedFile.status]}
                </span>
                <span className="text-sm font-medium">{selectedFile.relativePath}</span>
              </div>
              <button
                onClick={handleCloseDiff}
                className="p-1 hover:bg-secondary rounded transition-colors"
                aria-label={t('Close diff')}
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-auto p-4">
              {diffLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  <span className="ml-2 text-sm text-muted-foreground">{t('Loading diff...')}</span>
                </div>
              ) : diffError ? (
                <div className="text-center py-8">
                  <p className="text-sm text-destructive">{diffError}</p>
                </div>
              ) : diffContent ? (
                <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground">
                  {diffContent.split('\n').map((line, i) => {
                    if (line.startsWith('+')) {
                      return <div key={i} className="bg-green-500/10 text-green-500">{line}</div>
                    } else if (line.startsWith('-')) {
                      return <div key={i} className="bg-red-500/10 text-red-500">{line}</div>
                    } else if (line.startsWith('@@')) {
                      return <div key={i} className="text-blue-500">{line}</div>
                    } else {
                      return <div key={i}>{line}</div>
                    }
                  })}
                </pre>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">{t('No changes')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
