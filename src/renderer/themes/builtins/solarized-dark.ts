import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Solarized Dark theme — precision colors for machines and people.
 * https://ethanschoonover.com/solarized/
 */
export const solarizedDarkTheme: ThemeDefinition = {
  id: 'solarized-dark',
  name: 'Solarized Dark',
  type: 'dark',
  colors: {
    background:             '192 100% 5%',   // #002b36 — base03
    foreground:             '186 100% 73%',  // #839496 — base0
    card:                   '192 75% 8%',    // #073642 — base02
    'card-foreground':      '186 100% 73%',
    popover:                '192 75% 8%',
    'popover-foreground':   '186 100% 73%',
    primary:                '68 100% 40%',   // #268bd2 — blue
    'primary-foreground':   '0 0% 100%',
    secondary:              '192 75% 11%',   // #073642
    'secondary-foreground': '186 100% 73%',
    muted:                  '192 75% 11%',
    'muted-foreground':     '186 28% 46%',   // #657b83 — base1
    accent:                 '14 76% 48%',    // #cb4b16 — orange
    'accent-foreground':    '0 0% 100%',
    destructive:            '1 78% 44%',     // #dc322f — red
    'destructive-foreground': '0 0% 100%',
    border:                 '192 30% 20%',   // #586e75 — base01
    input:                  '192 75% 11%',
    ring:                   '68 100% 40%',
    'halo-glow':            '68 100% 40%',
    'halo-success':         '145 50% 38%',   // #859900 — green
    'halo-warning':         '45 100% 43%',   // #b58900 — yellow
    'halo-error':           '1 78% 44%',     // #dc322f — red
  } satisfies ThemeColors,
  preview: {
    background: '#002b36',
    foreground: '#839496',
    primary:    '#268bd2',
    accent:     '#cb4b16',
  },
}
