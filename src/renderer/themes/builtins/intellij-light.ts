import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * IntelliJ Light theme — based on the classic IntelliJ IDEA light color scheme.
 * Clean, professional light theme with the signature JetBrains blue accents.
 */
export const intellijLightTheme: ThemeDefinition = {
  id: 'intellij-light',
  name: 'IntelliJ Light',
  type: 'light',
  colors: {
    background:             '0 0% 100%',    // #ffffff
    foreground:             '229 13% 37%',  // #5E606E — not pure black
    card:                   '220 14% 96%',  // #f5f6f8 — subtle cool tint
    'card-foreground':      '229 13% 37%',
    popover:                '0 0% 100%',
    'popover-foreground':   '229 13% 37%',
    primary:                '210 44% 48%',  // #3574A8 — JetBrains signature blue
    'primary-foreground':   '0 0% 100%',
    secondary:              '220 14% 93%',  // #ebedf0
    'secondary-foreground': '229 13% 37%',
    muted:                  '220 14% 93%',
    'muted-foreground':     '220 9% 46%',   // #7A7F8C
    accent:                 '210 44% 48%',
    'accent-foreground':    '0 0% 100%',
    destructive:            '0 62% 50%',    // #CF5F5F — error red
    'destructive-foreground': '0 0% 100%',
    border:                 '220 13% 85%',  // #d4d5d8
    input:                  '220 14% 93%',
    ring:                   '210 44% 48%',
    'halo-glow':            '210 44% 48%',
    'halo-success':         '138 43% 43%',  // #4B8C5B — success green
    'halo-warning':         '38 80% 45%',   // #C78A2A — warning amber
    'halo-error':           '0 62% 50%',    // #CF5F5F — error red
  } satisfies ThemeColors,
  preview: {
    background: '#ffffff',
    foreground: '#5E606E',
    primary:    '#3574A8',
    accent:     '#3574A8',
  },
}
