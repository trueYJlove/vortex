/**
 * useSearchShortcuts Hook
 *
 * Manages keyboard shortcuts for content search:
 * - macOS: Cmd+K — Global content search
 * - Windows/Linux: Ctrl+F — Space search
 *
 * Note: Ctrl+Shift+P (command palette) is handled globally in App.tsx so it works
 * on every page, not just where this hook is mounted.
 */

import { useEffect } from 'react'
import { SearchScope } from '@/components/search'

interface UseSearchShortcutsOptions {
  enabled?: boolean
  onSearch?: (scope: SearchScope) => void
}

export function useSearchShortcuts({
  enabled = true,
  onSearch
}: UseSearchShortcutsOptions = {}) {
  useEffect(() => {
    if (!enabled || !onSearch) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if the event was already handled by a focused component
      // (e.g. CodeMirror's in-editor search)
      if (e.defaultPrevented) return

      const isMac = typeof navigator !== 'undefined' &&
        navigator.platform.toUpperCase().indexOf('MAC') >= 0

      const metaKey = isMac ? e.metaKey : e.ctrlKey

      if (isMac) {
        // macOS: Cmd+K — Global content search
        if (metaKey && e.shiftKey && (e.key === 'k' || e.key === 'K')) {
          e.preventDefault()
          onSearch('global')
          return
        }
      } else {
        // Windows/Linux: Ctrl+F — Space search
        if (metaKey && (e.key === 'f' || e.key === 'F') && !e.shiftKey) {
          e.preventDefault()
          onSearch('space')
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onSearch])
}
