/**
 * ConversationModelPill - Session-level model selector pill in InputToolbar.
 *
 * Shows the current conversation's model (or global default fallback) as a
 * clickable pill. Desktop: opens an inline dropdown panel containing ModelList.
 * Mobile: opens ModelSelectSheet.
 * Self-contained — no props required.
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { getModelDisplayName } from '../../types'
import { useTranslation } from '../../i18n'
import { useIsMobile } from '../../hooks/useIsMobile'
import { ModelList, ModelSelectSheet, useAiSources, useCurrentConversation } from '../layout/ModelSelector'

export function ConversationModelPill() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const aiSources = useAiSources()
  const currentConversation = useCurrentConversation()

  // Determine display: session pin → that model; otherwise global default.
  // Check both fields exist — if the pinned source was deleted, modelSourceId
  // may linger but modelId resolves to the global fallback, making a "Session"
  // badge misleading.
  const hasPin = Boolean(currentConversation?.modelSourceId && currentConversation?.modelId)
  const modelName = getModelDisplayName(
    aiSources,
    currentConversation?.modelSourceId,
    currentConversation?.modelId
  )

  // Close dropdown on outside click (desktop only)
  useEffect(() => {
    if (!isOpen || isMobile) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen, isMobile])

  // Escape key closes dropdown
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleToggle = () => setIsOpen(v => !v)
  const handleClose = () => setIsOpen(false)

  return (
    <div className="relative" ref={containerRef}>
      {/* Pill button */}
      <button
        onClick={handleToggle}
        className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg transition-colors duration-200 border ${
          isOpen
            ? 'border-primary/30 bg-primary/5 text-primary'
            : 'border-border text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50'
        }`}
        title={modelName}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
        <span className="text-xs max-w-[100px] truncate">{modelName}</span>
        {hasPin && (
          <span className="text-[9px] leading-none bg-primary/15 text-primary px-1 py-0.5 rounded">
            {t('Session')}
          </span>
        )}
        <ChevronDown
          size={12}
          className={`flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown / Sheet */}
      {isOpen && (
        isMobile ? (
          <ModelSelectSheet onClose={handleClose} sessionOnly />
        ) : (
          <div className="absolute left-0 bottom-full mb-2 w-64 bg-card border border-border rounded-xl shadow-lg z-50 py-1 max-h-[60vh] overflow-y-auto">
            <div className="px-3 py-2 border-b border-border/50">
              <p className="text-xs font-medium text-foreground">{modelName}</p>
              {hasPin && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t('Session-level model selection')}
                </p>
              )}
            </div>
            <ModelList onDone={handleClose} sessionOnly />
          </div>
        )
      )}
    </div>
  )
}
