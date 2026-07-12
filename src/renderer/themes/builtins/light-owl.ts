import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Light Owl — daytime light theme for Night Owl.
 * https://github.com/sdras/night-owl-vscode-theme
 */
export const lightOwlTheme: ThemeDefinition = {
  id: 'light-owl',
  name: 'Light Owl',
  type: 'light',
  colors: {
    background:             '210 40% 98%',    // #faf8f5 (editor bg)
    foreground:             '210 40% 20%',    // #011627 (fg)
    card:                   '210 38% 95%',    // #f0f4f8 (sidebar)
    'card-foreground':      '210 40% 20%',
    popover:                '210 38% 95%',
    'popover-foreground':   '210 40% 20%',
    primary:                '210 100% 37%',   // #005a9c (keyword blue)
    'primary-foreground':   '0 0% 100%',
    secondary:              '210 33% 92%',    // #e8edf3
    'secondary-foreground': '210 40% 20%',
    muted:                  '210 33% 92%',
    'muted-foreground':     '210 20% 48%',    // #5f7e97 (comment)
    accent:                 '19 70% 50%',     // #c25205 (orange string)
    'accent-foreground':    '0 0% 100%',
    destructive:            '355 60% 50%',    // #d32f2f (error)
    'destructive-foreground': '0 0% 100%',
    border:                 '210 29% 87%',    // #d1d9e0 (border)
    input:                  '210 33% 92%',
    ring:                   '210 100% 37%',
    'halo-glow':            '210 100% 37%',
    'halo-success':         '100 40% 38%',    // #1a7f37 (green)
    'halo-warning':         '40 90% 45%',     // #bf8700 (yellow)
    'halo-error':           '355 60% 50%',    // #d32f2f (red)
  } satisfies ThemeColors,
  preview: {
    background: '#faf8f5',
    foreground: '#011627',
    primary:    '#005a9c',
    accent:     '#c25205',
  },
}
