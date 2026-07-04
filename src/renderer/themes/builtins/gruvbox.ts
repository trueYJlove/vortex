import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Gruvbox theme — retro groove color scheme with warm orange/green accents.
 * https://github.com/morhetz/gruvbox
 */
export const gruvboxTheme: ThemeDefinition = {
  id: 'gruvbox',
  name: 'Gruvbox',
  type: 'dark',
  colors: {
    background:             '20 23% 12%',   // #282828
    foreground:             '40 35% 79%',   // #ebdbb2
    card:                   '20 23% 15%',   // #32302f — subtle elevation
    'card-foreground':      '40 35% 79%',
    popover:                '20 23% 15%',
    'popover-foreground':   '40 35% 79%',
    primary:                '142 26% 49%',  // #b8bb26 — Gruvbox green
    'primary-foreground':   '0 0% 100%',
    secondary:              '20 23% 18%',   // #3c3836
    'secondary-foreground': '40 35% 79%',
    muted:                  '20 23% 18%',
    'muted-foreground':     '40 10% 50%',   // #928374 — gray
    accent:                 '31 63% 54%',   // #d65d0e — Gruvbox orange
    'accent-foreground':    '0 0% 100%',
    destructive:            '0 62% 52%',    // #cc241d — Gruvbox red
    'destructive-foreground': '0 0% 100%',
    border:                 '20 13% 25%',   // #504945
    input:                  '20 23% 18%',
    ring:                   '142 26% 49%',
    'halo-glow':            '142 26% 49%',
    'halo-success':         '142 26% 49%',  // #b8bb26 — green
    'halo-warning':         '48 95% 53%',   // #d79921 — yellow
    'halo-error':           '0 62% 52%',    // #cc241d — red
  } satisfies ThemeColors,
  preview: {
    background: '#282828',
    foreground: '#ebdbb2',
    primary:    '#b8bb26',
    accent:     '#d65d0e',
  },
}
