/**
 * Theme Registry — central hub for all color themes.
 *
 * Adding a new theme:
 *  1. Create a file in ./builtins/ exporting a ThemeDefinition.
 *  2. Import and add it to BUILTIN_THEMES below.
 *  That's it — UI and runtime adapt automatically.
 */

import { darkTheme } from './builtins/dark'
import { lightTheme } from './builtins/light'
import { draculaTheme } from './builtins/dracula'
import { tokyoNightTheme } from './builtins/tokyo-night'
import { tokyoNightDayTheme } from './builtins/tokyo-night-day'
import { oneDarkProTheme } from './builtins/one-dark-pro'
import { nordTheme } from './builtins/nord'
import { catppuccinMochaTheme } from './builtins/catppuccin-mocha'
import { intellijLightTheme } from './builtins/intellij-light'
import { intellijDarkTheme } from './builtins/darcula'
import { githubDarkTheme } from './builtins/github-dark'
import { monokaiTheme } from './builtins/monokai'
import { gruvboxTheme } from './builtins/gruvbox'
import { solarizedDarkTheme } from './builtins/solarized-dark'

// ============================================
// Types
// ============================================

/** CSS variable key → HSL value (no --prefix, no hsl() wrapper) */
export interface ThemeColors {
  background: string
  foreground: string
  card: string
  'card-foreground': string
  popover: string
  'popover-foreground': string
  primary: string
  'primary-foreground': string
  secondary: string
  'secondary-foreground': string
  muted: string
  'muted-foreground': string
  accent: string
  'accent-foreground': string
  destructive: string
  'destructive-foreground': string
  border: string
  input: string
  ring: string
  'halo-glow': string
  'halo-success': string
  'halo-warning': string
  'halo-error': string
}

export interface ThemeDefinition {
  id: string
  /** Display name — shown in settings. Use i18n keys for translatable names, or raw strings for proper nouns (e.g. "Dracula"). */
  name: string
  /** Determines color-scheme, titleBarOverlay, and whether system-light/dark maps to this theme. */
  type: 'light' | 'dark'
  colors: ThemeColors
  /** Hex colors for the settings theme picker card preview. */
  preview: {
    background: string
    foreground: string
    primary: string
    accent: string
  }
}

// ============================================
// Built-in theme list (display order)
// ============================================

export const BUILTIN_THEMES: ThemeDefinition[] = [
  darkTheme,
  lightTheme,
  draculaTheme,
  tokyoNightTheme,
  tokyoNightDayTheme,
  oneDarkProTheme,
  nordTheme,
  catppuccinMochaTheme,
  intellijLightTheme,
  intellijDarkTheme,
  githubDarkTheme,
  monokaiTheme,
  gruvboxTheme,
  solarizedDarkTheme,
]

/** Auto-derived union type from BUILTIN_THEMES — no manual maintenance needed. */
export type BuiltInThemeId = typeof BUILTIN_THEMES[number]['id']

// ============================================
// Helpers
// ============================================

const themeMap = new Map(BUILTIN_THEMES.map(t => [t.id, t]))

export function getTheme(id: string): ThemeDefinition | undefined {
  return themeMap.get(id)
}

export function getAllThemes(): ThemeDefinition[] {
  return BUILTIN_THEMES
}

/** Get themes grouped by type (dark/light). */
export function getThemesByType(): { dark: ThemeDefinition[]; light: ThemeDefinition[] } {
  const dark: ThemeDefinition[] = []
  const light: ThemeDefinition[] = []
  for (const theme of BUILTIN_THEMES) {
    if (theme.type === 'dark') dark.push(theme)
    else light.push(theme)
  }
  return { dark, light }
}

/** Resolve 'system' to the concrete theme ID based on OS preference. */
export function resolveSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
