import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Monokai theme — based on the classic Sublime Text color scheme.
 * Vibrant syntax highlighting on a dark background.
 */
export const monokaiTheme: ThemeDefinition = {
  id: 'monokai',
  name: 'Monokai',
  type: 'dark',
  colors: {
    background:             '60 7% 13%',    // #272822
    foreground:             '90 4% 85%',    // #f8f8f2
    card:                   '60 7% 16%',    // #3e3d32 — subtle elevation
    'card-foreground':      '90 4% 85%',
    popover:                '60 7% 16%',
    'popover-foreground':   '90 4% 85%',
    primary:                '81 58% 55%',   // #a6e22e — Monokai green
    'primary-foreground':   '0 0% 100%',
    secondary:              '60 7% 19%',    // #49483e
    'secondary-foreground': '90 4% 85%',
    muted:                  '60 7% 19%',
    'muted-foreground':     '75 8% 45%',    // #75715e — Monokai comment
    accent:                 '321 100% 60%', // #f92672 — Monokai pink
    'accent-foreground':    '0 0% 100%',
    destructive:            '0 80% 55%',    // #f92672 — error (using pink)
    'destructive-foreground': '0 0% 100%',
    border:                 '60 7% 25%',    // #3e3d32
    input:                  '60 7% 19%',
    ring:                   '81 58% 55%',
    'halo-glow':            '81 58% 55%',
    'halo-success':         '81 58% 55%',   // #a6e22e — green
    'halo-warning':         '48 100% 67%',  // #e6db74 — yellow
    'halo-error':           '321 100% 60%', // #f92672 — pink
  } satisfies ThemeColors,
  preview: {
    background: '#272822',
    foreground: '#f8f8f2',
    primary:    '#a6e22e',
    accent:     '#f92672',
  },
}
