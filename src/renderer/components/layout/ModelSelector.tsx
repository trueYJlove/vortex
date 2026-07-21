/**
 * ModelSelector - Dropdown for selecting AI model in header (v2)
 * - Desktop: Dropdown menu from button
 * - Mobile: Bottom sheet for better touch interaction
 *   (ModelSelectSheet is exported for reuse, e.g. MobileOverflowMenu)
 *
 * Design: Uses v2 AISourcesConfig format with sources array
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus, Sparkles, X, Check, RefreshCw } from 'lucide-react'
import { useAppStore } from '../../stores/app.store'
import { useChatStore } from '../../stores/chat.store'
import { api } from '../../api'
import {
  getModelDisplayName,
  getCurrentModelName,
  getCurrentSource,
  AVAILABLE_MODELS,
  type AISourcesConfig,
  type AISource,
  type Conversation,
  type ModelOption
} from '../../types'
import { useTranslation } from '../../i18n'
import { useIsMobile } from '../../hooks/useIsMobile'
import { isAnthropicProvider } from '../../types'

/** Read v2 aiSources config with empty fallback */
export function useAiSources(): AISourcesConfig {
  const config = useAppStore(s => s.config)
  return config?.aiSources?.version === 2
    ? config.aiSources
    : { version: 2, currentId: null, sources: [] }
}

/**
 * Read the current conversation (full, from cache) so the selector can reflect
 * and mutate its per-conversation model pin. Returns null when no conversation
 * is active or it isn't cached yet. Selecting the conversation object by
 * reference keeps this subscription from re-rendering on every streaming token.
 */
export function useCurrentConversation(): Conversation | null {
  return useChatStore(s => {
    const conversationId = s.getCurrentSpaceState().currentConversationId
    return conversationId ? s.conversationCache.get(conversationId) ?? null : null
  })
}

/**
 * Model list content (sources accordion + footer actions).
 * Shared by the desktop dropdown and the mobile bottom sheet.
 * Calls onDone when a selection/action should close the container.
 */
export function ModelList({ onDone, sessionOnly }: { onDone: () => void; sessionOnly?: boolean }) {
  const { t } = useTranslation()
  const { config, setConfig, setView } = useAppStore()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const aiSources = useAiSources()
  const currentSource = getCurrentSource(aiSources)

  // Current conversation's model pin drives the checkmark; falls back to the
  // global selection for legacy conversations without a pin.
  const currentConversation = useCurrentConversation()
  const pinSourceId = currentConversation?.modelSourceId
  const pinModelId = currentConversation?.modelId

  // State for expanded sections (accordion).
  // In session-only mode, expand to the conversation's pinned source if any.
  const [expandedSection, setExpandedSection] = useState<string | null>(
    sessionOnly && pinSourceId ? pinSourceId : (currentSource?.id ?? null)
  )

  const toggleSection = (sourceId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedSection(prev => prev === sourceId ? null : sourceId)
  }

  if (!config) return null

  // Handle model selection.
  // Two modes:
  //   sessionOnly=true (ConversationModelPill): Pin to current conversation only.
  //   sessionOnly=false (global ModelSelector):  Update global default only.
  const handleSelectModel = async (sourceId: string, modelId: string) => {
    if (sessionOnly) {
      // Pin to the current conversation — no global changes
      const chat = useChatStore.getState()
      const spaceId = chat.currentSpaceId
      const conversationId = chat.getCurrentSpaceState().currentConversationId
      if (spaceId && conversationId) {
        await chat.setConversationModel(spaceId, conversationId, sourceId, modelId)
      }
      onDone()
      return
    }

    // Global mode: update the global default only (affects new conversations)
    if (aiSources.currentId !== sourceId) {
      const switchResult = await api.aiSourcesSwitchSource(sourceId)
      if (!switchResult.success) {
        console.error('[ModelSelector] Failed to switch source:', switchResult.error)
        onDone()
        return
      }
    }
    const result = await api.aiSourcesSetModel(modelId)
    if (result.success && result.data) {
      setConfig({ ...config, aiSources: result.data as AISourcesConfig })
    }
    onDone()
  }

  // Handle switching source only (adopts that source's last selected model).
  // Two modes:
  //   sessionOnly=true:  Pin conversation to the target source, no global change.
  //   sessionOnly=false: Switch global source (affects new conversations), no pin.
  const handleSwitchSource = async (sourceId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    if (aiSources.currentId === sourceId) return

    if (sessionOnly) {
      // Pin the conversation to this source's model — no global changes
      const targetSource = aiSources.sources.find(s => s.id === sourceId)
      const chat = useChatStore.getState()
      const spaceId = chat.currentSpaceId
      const conversationId = chat.getCurrentSpaceState().currentConversationId
      if (spaceId && conversationId && targetSource?.model) {
        await chat.setConversationModel(spaceId, conversationId, sourceId, targetSource.model)
      }
      onDone()
      return
    }

    // Global mode: switch global source only
    const result = await api.aiSourcesSwitchSource(sourceId)
    if (result.success && result.data) {
      setConfig({ ...config, aiSources: result.data as AISourcesConfig })
    }
    onDone()
  }

  // Handle add source
  const handleAddSource = () => {
    onDone()
    setView('settings')
  }

  // Refresh model lists for all sources from remote APIs
  const handleRefreshModels = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isRefreshing) return

    setIsRefreshing(true)
    try {
      const result = await api.refreshAISourcesConfig()
      if (result.success && result.data) {
        setConfig({ ...config, aiSources: (result.data as any).aiSources as AISourcesConfig })
        console.log('[ModelSelector] Models refreshed successfully')
      } else {
        console.warn('[ModelSelector] Refresh failed:', result.error)
      }
    } catch (error) {
      console.error('[ModelSelector] Failed to refresh models:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Get available models for a source
  const getModelsForSource = (source: AISource): ModelOption[] => {
    // If source has its own available models (user fetched or configured), use them
    if (source.availableModels && source.availableModels.length > 0) {
      return source.availableModels
    }

    // For Anthropic providers without custom models, use predefined defaults
    if (isAnthropicProvider(source.provider)) {
      return AVAILABLE_MODELS
    }

    // Fallback: return current model as single option
    if (source.model) {
      return [{ id: source.model, name: source.model }]
    }

    return []
  }

  // Get display name for source
  const getSourceDisplayName = (source: AISource): string => {
    if (source.name) return source.name
    if (source.authType === 'oauth') return 'OAuth Provider'
    if (isAnthropicProvider(source.provider)) return 'Claude API'
    return t('Custom API')
  }

  return (
    <>
      {/* Iterate all configured sources */}
      {aiSources.sources.map(source => {
        const isExpanded = expandedSection === source.id
        // In session-only mode, the "active source" follows the conversation's
        // pin, not the global config. This keeps the source indicator and model
        // checkmark consistent within the session-pill dropdown.
        const isActiveSource = sessionOnly
          ? (pinSourceId ? pinSourceId === source.id : aiSources.currentId === source.id)
          : aiSources.currentId === source.id
        const models = getModelsForSource(source)
        const displayName = getSourceDisplayName(source)

        return (
          <div key={source.id}>
            <div
              className={`px-3 py-2 text-xs font-medium flex items-center justify-between cursor-pointer hover:bg-secondary/50 transition-colors ${isActiveSource ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={(e) => toggleSection(source.id, e)}
            >
              <div className="flex items-center gap-2">
                <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                <span>{displayName}</span>
                {source.authType === 'oauth' && source.user?.name && (
                  <span className="text-xs text-muted-foreground">({source.user.name})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isActiveSource ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-primary" title={t('Active')} />
                ) : (
                  <button
                    onClick={(e) => handleSwitchSource(source.id, e)}
                    className="w-2.5 h-2.5 rounded-full border border-muted-foreground hover:border-primary hover:bg-primary/20 transition-colors"
                    title={t('Switch to this source')}
                  />
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="bg-secondary/10 pb-1">
                {models.map((model) => {
                  const modelId = typeof model === 'string' ? model : model.id
                  const modelName = typeof model === 'string' ? model : (model.name || model.id)
                  // Checkmark follows the mode:
                  //   sessionOnly=true:  follow conversation pin
                  //   sessionOnly=false: follow global config
                  const isSelected = sessionOnly
                    ? (pinSourceId === source.id && pinModelId === modelId)
                    : (isActiveSource && source.model === modelId)

                  return (
                    <button
                      key={modelId}
                      onClick={() => handleSelectModel(source.id, modelId)}
                      className={`w-full px-3 py-3 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2 pl-8 ${
                        isSelected ? 'text-primary' : 'text-foreground'
                      }`}
                    >
                      {isSelected ? <Check className="w-3 h-3" /> : <span className="w-3" />}
                      {modelName}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="border-t border-border/50" />
          </div>
        )
      })}

      {/* Footer: Add/Manage source + Refresh */}
      {aiSources.sources.length === 0 ? (
        <button
          onClick={handleAddSource}
          className="w-full px-3 py-3 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('Add AI Provider')}
        </button>
      ) : (
        <div className="flex items-center justify-between px-3 py-2">
          <button
            onClick={handleAddSource}
            className="text-left text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
          >
            <Plus className="w-3 h-3" />
            {t('Manage AI Provider')}
          </button>
          <button
            onClick={handleRefreshModels}
            disabled={isRefreshing}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded disabled:opacity-50"
            title={t('Refresh Models')}
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      )}
    </>
  )
}

/**
 * Mobile bottom sheet for model selection.
 * Manages its own exit animation, then calls onClose.
 */
export function ModelSelectSheet({ onClose, sessionOnly }: { onClose: () => void; sessionOnly?: boolean }) {
  const { t } = useTranslation()
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  const aiSources = useAiSources()
  const currentConversation = useCurrentConversation()
  const currentModelName = sessionOnly
    ? getModelDisplayName(aiSources, currentConversation?.modelSourceId, currentConversation?.modelId)
    : getCurrentModelName(aiSources)

  const handleClose = () => {
    setIsAnimatingOut(true)
    setTimeout(onClose, 200)
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className={`fixed inset-0 bg-black/40 z-40 ${isAnimatingOut ? 'animate-fade-out' : 'animate-fade-in'}`}
        style={{ animationDuration: '0.2s' }}
      />

      <div
        className={`
          fixed inset-x-0 bottom-0 z-50
          bg-card rounded-t-2xl border-t border-border/50
          shadow-2xl overflow-hidden
          ${isAnimatingOut ? 'animate-slide-out-bottom' : 'animate-slide-in-bottom'}
        `}
        style={{ maxHeight: '60vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-2">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-4 py-2 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-base font-semibold text-foreground">{t('Select Model')}</h3>
              <p className="text-xs text-muted-foreground">{currentModelName}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Model list */}
        <div className="overflow-auto" style={{ maxHeight: 'calc(60vh - 80px)' }}>
          <ModelList onDone={handleClose} sessionOnly={sessionOnly} />
        </div>
      </div>
    </>
  )
}

export function ModelSelector() {
  const isMobile = useIsMobile()
  const config = useAppStore(s => s.config)
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const aiSources = useAiSources()
  const currentModelName = getCurrentModelName(aiSources)

  // Close dropdown when clicking outside (desktop only)
  useEffect(() => {
    if (!isOpen || isMobile) return

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    // Use setTimeout to avoid the click event that opened the dropdown
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen, isMobile])

  // Handle escape key (desktop; sheet handles its own)
  useEffect(() => {
    if (!isOpen || isMobile) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isMobile])

  if (!config) return null

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button - icon only on mobile, text on desktop */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-lg transition-colors"
        title={currentModelName}
      >
        {/* Mobile: show Sparkles icon */}
        <Sparkles className="w-4 h-4 sm:hidden" />
        {/* Desktop: show model name */}
        <span className="hidden sm:inline max-w-[140px] truncate">{currentModelName}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown/Bottom Sheet */}
      {isOpen && (
        isMobile ? (
          <ModelSelectSheet onClose={() => setIsOpen(false)} />
        ) : (
          <div className="absolute right-0 top-full mt-1 w-64 bg-card border border-border rounded-xl shadow-lg z-50 py-1 max-h-[60vh] overflow-y-auto">
            <ModelList onDone={() => setIsOpen(false)} />
          </div>
        )
      )}
    </div>
  )
}
