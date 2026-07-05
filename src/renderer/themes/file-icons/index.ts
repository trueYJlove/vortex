export type { IconThemeDefinition } from './types'

import { materialIconTheme } from './material-icon-theme'
import { setiTheme } from './seti-theme'
import { vscodeIconsTheme } from './vscode-icons-theme'
import { classicTheme } from './classic-theme'
import type { IconThemeDefinition } from './types'

export const BUILTIN_ICON_THEMES: IconThemeDefinition[] = [
  materialIconTheme,
  setiTheme,
  vscodeIconsTheme,
  classicTheme,
]

export type IconThemeId = typeof BUILTIN_ICON_THEMES[number]['id']

const iconThemeMap = new Map(BUILTIN_ICON_THEMES.map(t => [t.id, t]))

export function getIconTheme(id: string): IconThemeDefinition {
  return iconThemeMap.get(id) || materialIconTheme
}

export function getAllIconThemes(): IconThemeDefinition[] {
  return BUILTIN_ICON_THEMES
}
