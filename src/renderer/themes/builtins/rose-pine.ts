import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Rosé Pine — warm, soft, and minimalist dark theme.
 * https://rosepinetheme.com/
 */
export const rosePineTheme: ThemeDefinition = {
  id: 'rose-pine',
  name: 'Rosé Pine',
  type: 'dark',
  colors: {
    background:             '249 18% 15%',    // #191724 (base)
    foreground:             '245 24% 87%',    // #e0def4 (text)
    card:                   '247 18% 18%',    // #1f1d2e (surface)
    'card-foreground':      '245 24% 87%',
    popover:                '247 18% 18%',
    'popover-foreground':   '245 24% 87%',
    primary:                '267 31% 72%',    // #c4a7e7 (foam → iris area)
    'primary-foreground':   '249 18% 15%',
    secondary:              '247 18% 23%',    // #26233a (overlay)
    'secondary-foreground': '245 24% 87%',
    muted:                  '247 18% 23%',
    'muted-foreground':     '245 14% 67%',    // #908caa (subtle)
    accent:                 '221 46% 73%',    // #9ccfd8 (foam)
    'accent-foreground':    '249 18% 15%',
    destructive:            '356 55% 71%',    // #eb6f92 (love)
    'destructive-foreground': '249 18% 15%',
    border:                 '247 18% 28%',    // #2a2837 (highlight)
    input:                  '247 18% 23%',
    ring:                   '267 31% 72%',
    'halo-glow':            '267 31% 72%',
    'halo-success':         '139 46% 66%',    // #31748f alternative green
    'halo-warning':         '35 61% 73%',     // #f6c177 (gold)
    'halo-error':           '356 55% 71%',    // #eb6f92 (love)
  } satisfies ThemeColors,
  preview: {
    background: '#191724',
    foreground: '#e0def4',
    primary:    '#c4a7e7',
    accent:     '#9ccfd8',
  },
}
