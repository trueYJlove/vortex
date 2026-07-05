import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Tokyo Night Day — light variant inspired by Tokyo Night palette.
 * https://github.com/enkia/tokyo-night-vscode-theme
 */
export const tokyoNightDayTheme: ThemeDefinition = {
  id: 'tokyo-night-day',
  name: 'Tokyo Night Day',
  type: 'light',
  colors: {
    background:             '222 28% 92%',    // #e1e2e7 — snow storm
    foreground:             '224 30% 22%',    // #3760bf — storm blue
    card:                   '220 23% 96%',    // #e9ebee
    'card-foreground':      '224 30% 22%',
    popover:                '220 23% 96%',
    'popover-foreground':   '224 30% 22%',
    primary:                '224 56% 57%',    // #3760bf — storm blue
    'primary-foreground':   '0 0% 100%',
    secondary:              '222 20% 88%',    // #d5d6db
    'secondary-foreground': '224 30% 22%',
    muted:                  '222 20% 88%',
    'muted-foreground':     '224 16% 52%',    // #838bb2
    accent:                 '224 48% 44%',    // #545c7e
    'accent-foreground':    '0 0% 100%',
    destructive:            '357 68% 54%',    // #843340
    'destructive-foreground': '0 0% 100%',
    border:                 '224 16% 78%',    // #c4c8da
    input:                  '222 20% 88%',
    ring:                   '224 56% 57%',
    'halo-glow':            '224 56% 57%',
    'halo-success':         '143 52% 42%',    // #33635c
    'halo-warning':         '34 56% 46%',     // #8f5e15
    'halo-error':           '357 68% 54%',    // #843340
  } satisfies ThemeColors,
  preview: {
    background: '#e1e2e7',
    foreground: '#3760bf',
    primary:    '#3760bf',
    accent:     '#545c7e',
  },
}
