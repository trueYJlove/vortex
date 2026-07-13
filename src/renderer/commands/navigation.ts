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

// Identity function: parser extracts `t('...')` keys for i18n, but the stored
// value is the English key itself. tt() in the panel translates at render time
// so language switches take effect without re-registration.
const t = (key: string): string => key

export function registerNavigationCommands(): () => void {
  const commands: Command[] = [
    {
      id: 'nav:home',
      title: t('Go to Home'),
      description: t('Space list and quick actions'),
      icon: Home,
      category: 'navigation',
      keywords: ['home', 'spaces', 'back'],
      perform: () => {
        useAppStore.getState().setView('home')
      },
    },
    {
      id: 'nav:halo-space',
      title: t('Open Vortex Space'),
      description: t('Default personal space'),
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
      title: t('Open Settings'),
      description: t('API, appearance, permissions, remote access'),
      icon: Settings,
      category: 'navigation',
      keywords: ['settings', 'config', 'preferences', 'api', 'theme'],
      perform: () => {
        useAppStore.getState().setView('settings')
      },
    },
    {
      id: 'nav:apps',
      title: t('Open Digital Humans'),
      description: t('Manage automation apps and skills'),
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
