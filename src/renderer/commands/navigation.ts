/**
 * Navigation commands — switch between top-level views.
 *
 * Uses useAppStore.setView directly. The Halo temp space gets a dedicated
 * command because most users will want to jump back to it frequently.
 */

import {
  Home,
  Settings,
  Blocks,
} from 'lucide-react'
import { useAppStore } from '../stores/app.store'
import { useSpaceStore } from '../stores/space.store'
import { useChatStore } from '../stores/chat.store'
import { registerCommands } from './registry'
import type { Command } from './registry'

export function registerNavigationCommands(): () => void {
  const commands: Command[] = [
    {
      id: 'nav:home',
      title: 'Go to Home',
      description: 'Space list and quick actions',
      icon: Home,
      category: 'navigation',
      keywords: ['home', 'spaces', 'back'],
      perform: () => {
        useAppStore.getState().setView('home')
      },
    },
    {
      id: 'nav:halo-space',
      title: 'Open Halo Space',
      description: 'Default personal space',
      icon: Home,
      category: 'navigation',
      keywords: ['halo', 'temp', 'default', 'space'],
      available: () => {
        const halo = useSpaceStore.getState().haloSpace
        const chat = useChatStore.getState()
        const view = useAppStore.getState().view
        return !!halo && !(chat.currentSpaceId === halo.id && view === 'space')
      },
      perform: async () => {
        const halo = useSpaceStore.getState().haloSpace
        if (!halo) return
        useSpaceStore.getState().setCurrentSpace(halo)
        useChatStore.getState().setCurrentSpace(halo.id)
        await useChatStore.getState().loadConversations(halo.id)
        useAppStore.getState().setView('space')
      },
    },
    {
      id: 'nav:settings',
      title: 'Open Settings',
      description: 'API, appearance, permissions, remote access',
      icon: Settings,
      category: 'navigation',
      keywords: ['settings', 'config', 'preferences', 'api', 'theme'],
      perform: () => {
        useAppStore.getState().setView('settings')
      },
    },
    {
      id: 'nav:apps',
      title: 'Open Digital Humans',
      description: 'Manage automation apps and skills',
      icon: Blocks,
      category: 'navigation',
      keywords: ['apps', 'digital human', 'automation', 'skills', 'agent'],
      perform: () => {
        useAppStore.getState().setView('apps')
      },
    },
  ]

  return registerCommands(commands)
}
