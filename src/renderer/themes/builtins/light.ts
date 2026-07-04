import type { ThemeDefinition, ThemeColors } from '../registry'

export const lightTheme: ThemeDefinition = {
  id: 'light',
  name: 'Light',
  type: 'light',
  colors: {
    background:             '0 0% 100%',   // #ffffff
    foreground:             '224 20% 14%', // #21252b — not pure black
    card:                   '210 20% 98%', // #f7f8fa — subtle cool tint
    'card-foreground':      '224 20% 14%',
    popover:                '0 0% 100%',
    'popover-foreground':   '224 20% 14%',
    primary:                '217 91% 55%', // #2563eb
    'primary-foreground':   '0 0% 100%',
    secondary:              '220 14% 94%', // #eff1f5
    'secondary-foreground': '220 14% 25%',
    muted:                  '220 14% 94%',
    'muted-foreground':     '220 10% 42%', // #6c7086
    accent:                 '217 91% 55%',
    'accent-foreground':    '0 0% 100%',
    destructive:            '0 72% 51%',
    'destructive-foreground': '0 0% 100%',
    border:                 '220 14% 90%', // #dce0e8
    input:                  '220 14% 94%',
    ring:                   '217 91% 55%',
    'halo-glow':            '217 91% 55%',
    'halo-success':         '142 71% 40%',
    'halo-warning':         '38 92% 45%',
    'halo-error':           '0 72% 51%',
  } satisfies ThemeColors,
  preview: {
    background: '#ffffff',
    foreground: '#21252b',
    primary:    '#2563eb',
    accent:     '#2563eb',
  },
}
