/**
 * Tool commands — toggle high-value features.
 *
 * These commands surface features that are otherwise buried in settings or
 * require multiple clicks. The AI Browser toggle and web search are the
 * most obvious wins; more can be added later without touching the panel.
 *
 * Note on availability: AI Browser is a desktop-only feature (BrowserView),
 * so the command is hidden on remote/Capacitor clients. The check uses
 * isElectron() so the panel never shows an action that would fail.
 */

import {
  Globe,
  Search,
  BookOpen,
} from 'lucide-react'
import { useAIBrowserStore } from '../stores/ai-browser.store'
import { useAppStore } from '../stores/app.store'
import { isElectron } from '../api/transport'
import { registerCommands } from './registry'
import type { Command } from './registry'

export function registerToolCommands(): () => void {
  const commands: Command[] = [
    {
      id: 'tool:toggle-ai-browser',
      title: 'Toggle AI Browser',
      description: 'Enable browser control for the current conversation',
      icon: Globe,
      category: 'tools',
      keywords: ['ai browser', 'browser', 'automation', 'web', 'cdp'],
      available: () => isElectron(),
      perform: () => {
        const store = useAIBrowserStore.getState()
        store.setEnabled(!store.enabled)
      },
    },
    {
      id: 'tool:focus-search',
      title: 'Search Content',
      description: 'Search across conversations, spaces, or globally',
      icon: Search,
      category: 'tools',
      keywords: ['search', 'find', 'content', 'messages'],
      perform: () => {
        // Delegates to the existing search panel via a custom event so
        // the command module stays decoupled from search.store. App.tsx
        // listens and opens the SearchPanel.
        window.dispatchEvent(new CustomEvent('command:focus-search'))
      },
    },
    {
      id: 'tool:open-knowledge',
      title: 'Open Knowledge Base',
      description: 'Manage indexed documents for this space',
      icon: BookOpen,
      category: 'tools',
      keywords: ['knowledge', 'rag', 'documents', 'index', 'embeddings'],
      available: () => !!useAppStore.getState().config,
      perform: () => {
        useAppStore.getState().setView('space')
      },
    },
  ]

  return registerCommands(commands)
}
