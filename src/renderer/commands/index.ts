/**
 * Command palette registration entry.
 *
 * Importing this module registers all built-in command groups. Call
 * `registerAllCommands()` once during app init; the returned unsubscribe
 * is for tests and hot-reload cleanup.
 */
import { registerNavigationCommands } from './navigation'
import { registerConversationCommands } from './conversation'
import { registerToolCommands } from './tools'

export function registerAllCommands(): () => void {
  const unsubs = [
    registerNavigationCommands(),
    registerConversationCommands(),
    registerToolCommands(),
  ]
  return () => unsubs.forEach((fn) => fn())
}

export type { Command, CommandCategory } from './registry'
