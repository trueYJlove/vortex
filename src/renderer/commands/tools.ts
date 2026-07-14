/**
 * Tool commands — toggle high-value features.
 *
 * These commands surface features that are otherwise buried in settings or
 * require multiple clicks. The web search and knowledge base are the
 * most obvious wins; more can be added later without touching the panel.
 */

import {
  Search,
  BookOpen,
} from 'lucide-react'
import { useAppStore } from '../stores/app.store'
import { useSpaceStore } from '../stores/space.store'
import { registerCommands } from './registry'
import type { Command } from './registry'

// Identity function: parser extracts `t('...')` keys for i18n, but the stored
// value is the English key itself. tt() in the panel translates at render time
// so language switches take effect without re-registration.
const t = (key: string): string => key

export function registerToolCommands(): () => void {
  const commands: Command[] = [
    {
      id: 'tool:focus-search',
      title: t('Search Content'),
      description: t('Search across conversations, spaces, or globally'),
      icon: Search,
      category: 'tools',
      keywords: ['search', 'find', 'content', 'messages'],
      perform: () => {
        window.dispatchEvent(new CustomEvent('command:focus-search'))
      },
    },
    {
      id: 'tool:open-knowledge',
      title: t('Open Knowledge Base'),
      description: t('Manage indexed documents for this space'),
      icon: BookOpen,
      category: 'tools',
      keywords: ['knowledge', 'rag', 'documents', 'index', 'embeddings'],
      available: () => !!useAppStore.getState().config && !!useSpaceStore.getState().currentSpace,
      perform: () => {
        useAppStore.getState().setView('space')
        window.dispatchEvent(new CustomEvent('command:open-knowledge'))
      },
    },
  ]

  return registerCommands(commands)
}
