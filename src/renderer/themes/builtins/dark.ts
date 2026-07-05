import type { ThemeDefinition, ThemeColors } from '../registry'

export const darkTheme: ThemeDefinition = {
  id: 'dark',
  name: 'Dark',
  type: 'dark',
  colors: {
    background:             '220 13% 10%',   // #161822 — layered, not pure black
    foreground:             '220 14% 93%',   // #e8eaf0 — warm off-white
    card:                   '224 14% 13%',   // #1e2030 — subtle elevation
    'card-foreground':      '220 14% 93%',
    popover:                '224 14% 13%',
    'popover-foreground':   '220 14% 93%',
    primary:                '217 91% 60%',   // #3b82f6
    'primary-foreground':   '0 0% 100%',
    secondary:              '224 12% 18%',   // #2a2d3e
    'secondary-foreground': '220 14% 93%',
    muted:                  '224 12% 18%',
    'muted-foreground':     '220 10% 55%',   // #7f849c
    accent:                 '217 91% 60%',
    'accent-foreground':    '0 0% 100%',
    destructive:            '0 72% 51%',
    'destructive-foreground': '0 0% 100%',
    border:                 '225 12% 22%',   // #363950
    input:                  '224 12% 18%',
    ring:                   '217 91% 60%',
    'halo-glow':            '262 83% 66%',
    'halo-success':         '142 71% 45%',
    'halo-warning':         '38 92% 50%',
    'halo-error':           '0 72% 51%',
  } satisfies ThemeColors,
  preview: {
    background: '#161822',
    foreground: '#e8eaf0',
    primary:    '#8b5cf6',
    accent:     '#8b5cf6',
  },
}
