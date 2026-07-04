import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Darcula theme — based on the classic IntelliJ IDEA Darcula color scheme.
 * The iconic dark theme used across all JetBrains IDEs.
 */
export const darculaTheme: ThemeDefinition = {
  id: 'darcula',
  name: 'Darcula',
  type: 'dark',
  colors: {
    background:             '224 12% 17%',  // #2b2b2b — classic Darcula background
    foreground:             '207 19% 66%',  // #a9b7c6 — Darcula default text
    card:                   '225 11% 20%',  // #313335 — subtle elevation
    'card-foreground':      '207 19% 66%',
    popover:                '225 11% 20%',
    'popover-foreground':   '207 19% 66%',
    primary:                '206 37% 57%',  // #6897BB — Darcula blue
    'primary-foreground':   '0 0% 100%',
    secondary:              '224 12% 23%',  // #3c3f41 — Darcula secondary
    'secondary-foreground': '207 19% 66%',
    muted:                  '224 12% 23%',
    'muted-foreground':     '218 10% 50%',  // #808080 — Darcula comment gray
    accent:                 '291 47% 56%',  // #9876AA — Darcula purple
    'accent-foreground':    '0 0% 100%',
    destructive:            '4 54% 52%',    // #CF6A4C — Darcula orange-red
    'destructive-foreground': '0 0% 100%',
    border:                 '220 9% 32%',   // #515151 — Darcula border
    input:                  '224 12% 23%',
    ring:                   '206 37% 57%',
    'halo-glow':            '206 37% 57%',
    'halo-success':         '119 34% 48%',  // #6A8759 — Darcula green
    'halo-warning':         '36 66% 53%',   // #BBB529 — Darcula yellow
    'halo-error':           '4 54% 52%',    // #CF6A4C — Darcula orange-red
  } satisfies ThemeColors,
  preview: {
    background: '#2b2b2b',
    foreground: '#a9b7c6',
    primary:    '#6897BB',
    accent:     '#9876AA',
  },
}
