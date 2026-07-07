import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Solarized Light — scientifically calibrated light theme.
 * First designed in 2011 with precise CIELAB luminance relationships.
 * https://ethanschoonover.com/solarized/
 */
export const solarizedLightTheme: ThemeDefinition = {
  id: 'solarized-light',
  name: 'Solarized Light',
  type: 'light',
  colors: {
    background:             '44 87% 93%',    // #fdf6e3 (base3)
    foreground:             '192 55% 35%',    // #586e75 (base00)
    card:                   '44 87% 95%',    // #eee8d5 (base2)
    'card-foreground':      '192 55% 35%',
    popover:                '44 87% 95%',
    'popover-foreground':   '192 55% 35%',
    primary:                '205 78% 32%',    // #268bd2 (blue)
    'primary-foreground':   '44 87% 93%',
    secondary:              '44 87% 91%',    // #e7dfc7 (base2 tint)
    'secondary-foreground': '192 55% 35%',
    muted:                  '44 87% 91%',
    'muted-foreground':     '195 7% 47%',     // #839496 (base0)
    accent:                 '68 82% 32%',     // #859900 (green)
    'accent-foreground':    '44 87% 93%',
    destructive:            '5 71% 47%',      // #dc322f (red)
    'destructive-foreground': '44 87% 93%',
    border:                 '44 34% 81%',     // #d3cbb7 (base2 dark)
    input:                  '44 87% 91%',
    ring:                   '205 78% 32%',
    'halo-glow':            '205 78% 32%',
    'halo-success':         '68 82% 32%',     // #859900 (green)
    'halo-warning':         '45 100% 35%',    // #b58900 (yellow)
    'halo-error':           '5 71% 47%',      // #dc322f (red)
  } satisfies ThemeColors,
  preview: {
    background: '#fdf6e3',
    foreground: '#586e75',
    primary:    '#268bd2',
    accent:     '#859900',
  },
}
