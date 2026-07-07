import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Everforest — nature-inspired low-contrast dark theme.
 * https://github.com/sainnhe/everforest
 */
export const everforestTheme: ThemeDefinition = {
  id: 'everforest',
  name: 'Everforest',
  type: 'dark',
  colors: {
    background:             '178 15% 15%',    // #232a2e (bg0)
    foreground:             '152 13% 77%',    // #d3c6aa (fg)
    card:                   '180 13% 19%',    // #2d353b (bg1)
    'card-foreground':      '152 13% 77%',
    popover:                '180 13% 19%',
    'popover-foreground':   '152 13% 77%',
    primary:                '96 25% 65%',     // #a7c080 (green)
    'primary-foreground':   '178 15% 15%',
    secondary:              '185 13% 24%',    // #343f44 (bg2)
    'secondary-foreground': '152 13% 77%',
    muted:                  '185 13% 24%',
    'muted-foreground':     '148 9% 46%',     // #868d80 (grey2)
    accent:                 '355 62% 67%',    // #e67e80 (red)
    'accent-foreground':    '178 15% 15%',
    destructive:            '355 62% 57%',    // #e67e80 ↓
    'destructive-foreground': '178 15% 15%',
    border:                 '156 12% 31%',    // #475258 (bg3)
    input:                  '185 13% 24%',
    ring:                   '96 25% 65%',
    'halo-glow':            '96 25% 65%',
    'halo-success':         '96 25% 65%',     // #a7c080 (green)
    'halo-warning':         '48 43% 63%',     // #dbbc7f (yellow)
    'halo-error':           '355 62% 67%',    // #e67e80 (red)
  } satisfies ThemeColors,
  preview: {
    background: '#232a2e',
    foreground: '#d3c6aa',
    primary:    '#a7c080',
    accent:     '#e67e80',
  },
}
