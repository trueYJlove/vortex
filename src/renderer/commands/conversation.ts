/**
 * Conversation commands — create and switch conversations and spaces.
 *
 * Switching spaces needs the Space object (not just id) because SpacePage
 * reads currentSpace from useSpaceStore. For "new conversation" we require
 * a current space; if none is set, the command stays hidden via available().
 */

import {
  Plus,
  MessageSquare,
  Folder,
} from 'lucide-react'
import { useChatStore } from '../stores/chat.store'
import { useSpaceStore } from '../stores/space.store'
import { useAppStore } from '../stores/app.store'
import { registerCommands } from './registry'
import type { Command } from './registry'

// Identity function: parser extracts `t('...')` keys for i18n, but the stored
// value is the English key itself. tt() in the panel translates at render time
// so language switches take effect without re-registration.
const t = (key: string): string => key

export function registerConversationCommands(): () => void {
  const commands: Command[] = [
    {
      id: 'conv:new',
      title: t('New Conversation'),
      description: t('Start a new chat in the current space'),
      icon: Plus,
      category: 'conversation',
      keywords: ['new', 'create', 'chat', 'conversation', 'start'],
      available: () => {
        const chat = useChatStore.getState()
        return !!chat.currentSpaceId
      },
      perform: async () => {
        const chat = useChatStore.getState()
        const spaceId = chat.currentSpaceId
        if (!spaceId) return
        await chat.createConversation(spaceId)
        useAppStore.getState().setView('space')
      },
    },
    {
      id: 'conv:goto-current-space',
      title: t('Open Current Space'),
      description: t('Jump into the space you are in now'),
      icon: Folder,
      category: 'conversation',
      keywords: ['space', 'open', 'current', 'project'],
      available: () => !!useSpaceStore.getState().currentSpace,
      perform: () => {
        useAppStore.getState().setView('space')
      },
    },
    {
      id: 'conv:recent',
      title: t('Recent Conversations'),
      description: t('Jump to the most recent conversation in this space'),
      icon: MessageSquare,
      category: 'conversation',
      keywords: ['recent', 'continue', 'last', 'history', 'conversation'],
      available: () => {
        const chat = useChatStore.getState()
        if (!chat.currentSpaceId) return false
        const state = chat.spaceStates.get(chat.currentSpaceId)
        return !!state && state.conversations.length > 0
      },
      perform: async () => {
        const chat = useChatStore.getState()
        const spaceId = chat.currentSpaceId
        if (!spaceId) return
        const state = chat.spaceStates.get(spaceId)
        if (!state || state.conversations.length === 0) return
        const recent = state.conversations[0]
        useAppStore.getState().setView('space')
        await chat.selectConversation(recent.id)
      },
    },
  ]

  return registerCommands(commands)
}
