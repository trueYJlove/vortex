/**
 * Command registry — global command palette core.
 *
 * Commands are self-contained action descriptors. Each command owns its
 * availability check and perform callback, so the panel only needs to filter
 * by query and render the list. Registers are pure data — no React state —
 * which keeps the registry testable and tree-shakeable.
 *
 * Categories drive grouping in the panel UI. The order of categories here
 * defines their display order.
 */

import type { LucideIcon } from 'lucide-react'
import i18n from 'i18next'

export type CommandCategory =
  | 'navigation'
  | 'conversation'
  | 'tools'

export interface Command {
  id: string
  /** i18n key — displayed via t() in the panel. */
  title: string
  /** i18n key — displayed via t() in the panel. */
  description?: string
  icon?: LucideIcon
  category: CommandCategory
  keywords?: string[]
  shortcut?: string
  perform: () => void | Promise<void>
  /** Return false to hide the command from the list (e.g. feature unavailable). */
  available?: () => boolean
}

export const CATEGORY_ORDER: CommandCategory[] = [
  'navigation',
  'conversation',
  'tools',
]

/** Translate a command title or description key. */
export function tt(key: string): string {
  return i18n.t(key)
}

const registry = new Map<string, Command>()

export function registerCommand(cmd: Command): () => void {
  registry.set(cmd.id, cmd)
  return () => {
    registry.delete(cmd.id)
  }
}

export function registerCommands(commands: Command[]): () => void {
  const unregisters = commands.map(registerCommand)
  return () => unregisters.forEach((fn) => fn())
}

export function getCommands(): Command[] {
  return Array.from(registry.values())
}

export function clearCommands(): void {
  registry.clear()
}

/**
 * Query matching — simple substring match on title, description, and keywords.
 * Case-insensitive. Empty query returns all commands (caller decides whether
 * to show all or a curated subset).
 */
export function matchCommand(cmd: Command, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  const title = i18n.t(cmd.title).toLowerCase()
  if (title.includes(lower)) return true
  if (cmd.description) {
    const desc = i18n.t(cmd.description).toLowerCase()
    if (desc.includes(lower)) return true
  }
  if (cmd.keywords?.some((k) => k.toLowerCase().includes(lower))) return true
  return false
}
