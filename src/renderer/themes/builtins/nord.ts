import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Nord theme — inspired by the arctic, north-bluish color palette.
 * https://www.nordtheme.com/
 * Uses Polar Night (backgrounds), Snow Storm (foregrounds),
 * Frost (primary/accent), and Aurora (semantic) palettes.
 */
export const nordTheme: ThemeDefinition = {
  id: 'nord',
  name: 'Nord',
  type: 'dark',
  colors: {
    background:             '218 28% 22%',    // #2e3440 (nord0)
    foreground:             '218 19% 87%',    // #d8dee9 (nord4)
    card:                   '219 23% 28%',    // #3b4252 (nord1)
    'card-foreground':      '218 19% 87%',
    popover:                '219 23% 28%',
    'popover-foreground':   '218 19% 87%',
    primary:                '207 44% 52%',    // #5e81ac (frost)
    'primary-foreground':   '218 32% 94%',    // #eceff4 (nord6)
    secondary:              '218 22% 32%',    // #434c5e (nord2)
    'secondary-foreground': '218 19% 87%',
    muted:                  '218 22% 32%',
    'muted-foreground':     '218 22% 44%',    // #616e88 (approximated)
    accent:                 '187 38% 67%',    // #88c0d0 (frost)
    'accent-foreground':    '218 28% 22%',
    destructive:            '355 43% 57%',    // #bf616a (aurora red)
    'destructive-foreground': '218 32% 94%',
    border:                 '217 19% 36%',    // #4c566a (nord3)
    input:                  '218 22% 32%',
    ring:                   '207 44% 52%',
    'halo-glow':            '207 44% 52%',
    'halo-success':         '97 33% 64%',     // #a3be8c (aurora green)
    'halo-warning':         '41 60% 73%',     // #ebcb8b (aurora yellow)
    'halo-error':           '355 43% 57%',    // #bf616a (aurora red)
  } satisfies ThemeColors,
  preview: {
    background: '#2e3440',
    foreground: '#d8dee9',
    primary:    '#5e81ac',
    accent:     '#88c0d0',
  },
}
