import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Ayu Light — clean, bright light theme.
 * Minimalist and easy to read with warm accents.
 * https://github.com/ayu-theme/ayu-colors
 */
export const ayuLightTheme: ThemeDefinition = {
  id: 'ayu-light',
  name: 'Ayu Light',
  type: 'light',
  colors: {
    background:             '45 20% 95%',    // #fafafa (common.bg)
    foreground:             '45 1% 40%',      // #6c7680 (syntax.fg)
    card:                   '45 10% 92%',     // #f0f0f0
    'card-foreground':      '45 1% 40%',
    popover:                '45 20% 95%',
    'popover-foreground':   '45 1% 40%',
    primary:                '35 75% 55%',     // #e6a643 (syntax.func)
    'primary-foreground':   '45 20% 95%',
    secondary:              '45 10% 88%',     // #e0e0e0
    'secondary-foreground': '45 1% 40%',
    muted:                  '45 10% 88%',
    'muted-foreground':     '45 3% 55%',      // #8a8a8a (syntax.comment)
    accent:                 '200 55% 55%',    // #41a6d9 (syntax.tag)
    'accent-foreground':    '45 20% 95%',
    destructive:            '0 50% 50%',      // #cc4040 (syntax.error)
    'destructive-foreground': '45 20% 95%',
    border:                 '45 10% 82%',     // #d0d0d0 (guide)
    input:                  '45 10% 88%',
    ring:                   '35 75% 55%',
    'halo-glow':            '35 75% 55%',
    'halo-success':         '85 30% 48%',     // #86b300 (adjusted green)
    'halo-warning':         '35 75% 55%',     // #e6a643
    'halo-error':           '0 50% 50%',      // #cc4040
  } satisfies ThemeColors,
  preview: {
    background: '#fafafa',
    foreground: '#6c7680',
    primary:    '#e6a643',
    accent:     '#41a6d9',
  },
}
