/**
 * CommandPanel — Spotlight-style global command palette.
 *
 * Opens with Ctrl+K (replaces the old direct-to-search binding). The panel
 * fuses two kinds of results in a single list:
 *   1. Commands (top) — static actions registered via commands/registry
 *   2. Content search results (below) — from the existing search API
 *
 * Prefix modes:
 *   `>`  commands only
 *   `/`  search only
 *   none fused (commands first, then search results once query >= 2 chars)
 *
 * The old SearchPanel remains intact for scope tabs and highlight-bar
 * workflows; this panel is the new Ctrl+K entry point. Clicking a search
 * result delegates to the same navigation flow by dispatching the same
 * `search:navigate-to-message` event SearchPanel uses.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/api'
import { useTranslation } from '@/i18n'
import { useCommandPanelStore } from '@/stores/command-panel.store'
import { useSearchStore } from '@/stores/search.store'
import { useChatStore } from '@/stores/chat.store'
import { useSpaceStore } from '@/stores/space.store'
import {
  getCommands,
  matchCommand,
  CATEGORY_ORDER,
  tt,
} from '@/commands/registry'
import type { Command, CommandCategory } from '@/commands/registry'

interface SearchResultItem {
  conversationId: string
  conversationTitle: string
  messageId: string
  spaceId: string
  spaceName: string
  messageRole: 'user' | 'assistant'
  messageContent: string
  messageTimestamp: string
  matchCount: number
  contextBefore?: string
  contextAfter?: string
}

type RowKind = 'command' | 'result'

interface Row {
  kind: RowKind
  index: number
  command?: Command
  result?: SearchResultItem
  category?: CommandCategory
}

export function CommandPanel() {
  const { t } = useTranslation()
  const categoryLabels: Record<CommandCategory, string> = useMemo(
    () => ({
      navigation: t('Navigation'),
      conversation: t('Conversation'),
      tools: t('Tools'),
    }),
    [t]
  )
  const { isOpen, query, selectedIndex, close, setQuery, setSelectedIndex } =
    useCommandPanelStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const currentSpaceId = useChatStore((s) => s.currentSpaceId)
  // Subscribe to spaceStates so the selector recomputes when the current
  // conversation changes. getCurrentConversationId reads from the Map.
  const currentConversationId = useChatStore((s) => {
    if (!s.currentSpaceId) return null
    return s.spaceStates.get(s.currentSpaceId)?.currentConversationId ?? null
  })
  const { spaces, haloSpace, setCurrentSpace: setSpaceStoreCurrentSpace } =
    useSpaceStore()
  const { setCurrentSpace: setChatCurrentSpace, loadConversations, selectConversation } =
    useChatStore()

  const [results, setResults] = useState<SearchResultItem[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Parse prefix mode and the effective query
  const mode: 'fused' | 'commands' | 'search' =
    query.startsWith('>') ? 'commands' : query.startsWith('/') ? 'search' : 'fused'
  const effectiveQuery = query.replace(/^[>/]/, '').trim()

  // Filter commands
  const visibleCommands = useMemo(() => {
    if (mode === 'search') return []
    const all = getCommands().filter((c) => c.available?.() ?? true)
    const matched = effectiveQuery ? all.filter((c) => matchCommand(c, effectiveQuery)) : all
    return matched
  }, [mode, effectiveQuery, isOpen])

  // Debounced content search. The cancelled flag guards against stale
  // responses overwriting newer results and against setState after unmount.
  useEffect(() => {
    if (!isOpen) {
      setResults(null)
      return
    }
    if (mode === 'commands') {
      setResults(null)
      return
    }
    if (effectiveQuery.length < 2) {
      setResults(null)
      setIsSearching(false)
      return
    }

    let cancelled = false
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const scope = currentSpaceId ? 'space' : 'global'
        const response = await api.search(
          effectiveQuery,
          scope,
          currentConversationId ?? undefined,
          currentSpaceId ?? undefined
        )
        if (cancelled) return
        if (response.success && response.data) {
          setResults(response.data as SearchResultItem[])
        } else {
          setResults([])
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[CommandPanel] search failed:', err)
          setResults([])
        }
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    }, 250)

    return () => {
      cancelled = true
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [effectiveQuery, mode, isOpen, currentSpaceId, currentConversationId])

  // Build the flat row list (commands grouped by category, then results)
  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    if (mode !== 'search') {
      const grouped: Record<CommandCategory, Command[]> = {
        navigation: [],
        conversation: [],
        tools: [],
      }
      for (const cmd of visibleCommands) {
        grouped[cmd.category].push(cmd)
      }
      for (const cat of CATEGORY_ORDER) {
        for (const cmd of grouped[cat]) {
          out.push({ kind: 'command', index: out.length, command: cmd, category: cat })
        }
      }
    }
    if (mode !== 'commands' && results && results.length > 0) {
      for (const r of results) {
        out.push({ kind: 'result', index: out.length, result: r })
      }
    }
    return out
  }, [mode, visibleCommands, results])

  // Clamp selectedIndex when rows change. Use Math.min so the selection
  // stays on the last item when the list shrinks, rather than jumping to 0.
  useEffect(() => {
    if (rows.length === 0) {
      setSelectedIndex(0)
    } else if (selectedIndex >= rows.length) {
      setSelectedIndex(rows.length - 1)
    }
  }, [rows, selectedIndex, setSelectedIndex])

  // Focus input on open; reset on close
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [isOpen, setQuery, setSelectedIndex])

  // Scroll selected row into view
  useEffect(() => {
    if (!isOpen || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-row-idx="${selectedIndex}"]`
    )
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, isOpen])

  const runCommand = async (cmd: Command) => {
    close()
    try {
      await cmd.perform()
    } catch (err) {
      console.error('[CommandPanel] command failed:', cmd.id, err)
    }
  }

  const runResult = async (r: SearchResultItem) => {
    close()
    try {
      if (r.spaceId !== currentSpaceId) {
        let targetSpace = null
        if (r.spaceId === 'halo-temp' && haloSpace) {
          targetSpace = haloSpace
        } else {
          targetSpace = spaces.find((s) => s.id === r.spaceId) || null
        }
        if (!targetSpace) {
          console.error('[CommandPanel] space not found:', r.spaceId)
          return
        }
        setSpaceStoreCurrentSpace(targetSpace)
        setChatCurrentSpace(r.spaceId)
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      await loadConversations(r.spaceId)
      await selectConversation(r.conversationId)
      // Activate highlight bar so users can navigate across all matches
      // with arrow keys, same as clicking a result in SearchPanel.
      const resultsArray = results ?? []
      useSearchStore
        .getState()
        .showHighlightBar(effectiveQuery, resultsArray, resultsArray.findIndex((x) => x.messageId === r.messageId))
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('search:navigate-to-message', {
            detail: { messageId: r.messageId, query: effectiveQuery },
          })
        )
      }, 300)
    } catch (err) {
      console.error('[CommandPanel] result navigation failed:', err)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (rows.length === 0) return
      setSelectedIndex((selectedIndex + 1) % rows.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (rows.length === 0) return
      setSelectedIndex((selectedIndex - 1 + rows.length) % rows.length)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const row = rows[selectedIndex]
      if (!row) return
      if (row.kind === 'command' && row.command) void runCommand(row.command)
      else if (row.kind === 'result' && row.result) void runResult(row.result)
      return
    }
  }

  if (!isOpen) return null

  let lastCategory: CommandCategory | null = null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-[12vh] sm:pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        className="w-full max-w-xl bg-background border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] sm:max-h-[75vh]"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={18} className="text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder={t('Type a command or search...')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
            autoComplete="off"
            spellCheck={false}
          />
          {isSearching && (
            <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin flex-shrink-0" />
          )}
        </div>

        {/* List */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-2">
          {rows.length === 0 && !isSearching && (
            <div className="text-center py-10 text-sm text-muted-foreground">
              {effectiveQuery
                ? t('No matching commands or results')
                : t('Start typing to search or run a command')}
            </div>
          )}
          {rows.length === 0 && isSearching && (
            <div className="text-center py-10 text-sm text-muted-foreground">
              {t('Searching...')}
            </div>
          )}
          {rows.map((row) => {
            const isSelected = row.index === selectedIndex
            if (row.kind === 'command' && row.command) {
              const showHeader = row.category !== lastCategory
              lastCategory = row.category ?? null
              const Icon = row.command.icon
              return (
                <div key={`cmd-${row.command.id}`}>
                  {showHeader && (
                    <div className="px-4 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {categoryLabels[row.category!]}
                    </div>
                  )}
                  <button
                    type="button"
                    data-row-idx={row.index}
                    onClick={() => runCommand(row.command!)}
                    onMouseEnter={() => setSelectedIndex(row.index)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                      isSelected ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted/50'
                    )}
                  >
                    {Icon && <Icon size={16} className="text-muted-foreground flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{tt(row.command!.title)}</div>
                      {row.command!.description && (
                        <div className="truncate text-xs text-muted-foreground">
                          {tt(row.command!.description)}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <CornerDownLeft size={14} className="text-muted-foreground flex-shrink-0" />
                    )}
                  </button>
                </div>
              )
            }
            if (row.kind === 'result' && row.result) {
              const r = row.result
              return (
                <button
                  key={`res-${r.messageId}`}
                  type="button"
                  data-row-idx={row.index}
                  onClick={() => runResult(r)}
                  onMouseEnter={() => setSelectedIndex(row.index)}
                  className={cn(
                    'w-full flex items-start gap-3 px-4 py-2 text-left transition-colors',
                    isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                        {r.spaceName}
                      </span>
                      <span className="text-xs font-medium truncate">
                        {r.conversationTitle}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1 border-l-2 border-primary/50">
                      <span>{r.contextBefore}</span>
                      <span className="bg-yellow-500/30 font-semibold px-0.5">
                        {effectiveQuery}
                      </span>
                      <span>{r.contextAfter}</span>
                    </div>
                  </div>
                </button>
              )
            }
            return null
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ArrowUp size={12} />
              <ArrowDown size={12} />
              {t('Navigate')}
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft size={12} />
              {t('Select')}
            </span>
            <span>Esc {t('Close')}</span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">&gt;{t('Commands')}</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">/{t('Search')}</kbd>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
