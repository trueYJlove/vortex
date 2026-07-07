import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Material Palenight — Google-inspired dark theme.
 * Based on the popular Material Theme Palenight variant.
 * https://material-theme.com/
 */
export const materialPalenightTheme: ThemeDefinition = {
  id: 'material-palenight',
  name: 'Material Palenight',
  type: 'dark',
  colors: {
    background:             '244 19% 18%',    // #292d3e (bg)
    foreground:             '225 44% 85%',    // #bfc7d5 (fg)
    card:                   '243 20% 22%',    // #303348 (card)
    'card-foreground':      '225 44% 85%',
    popover:                '243 20% 22%',
    'popover-foreground':   '225 44% 85%',
    primary:                '251 51% 74%',    // #c3aedc (purple)
    'primary-foreground':   '244 19% 18%',
    secondary:              '245 21% 27%',    // #3a3f58 (lighter)
    'secondary-foreground': '225 44% 85%',
    muted:                  '245 21% 27%',
    'muted-foreground':     '226 14% 49%',    // #676e95 (comment)
    accent:                 '25 88% 71%',     // #f78c6c (orange)
    'accent-foreground':    '244 19% 18%',
    destructive:            '355 53% 65%',    // #d95468 (red)
    'destructive-foreground': '244 19% 18%',
    border:                 '244 18% 34%',    // #444a64 (border)
    input:                  '245 21% 27%',
    ring:                   '251 51% 74%',
    'halo-glow':            '251 51% 74%',
    'halo-success':         '92 33% 62%',     // #c3e88d (green)
    'halo-warning':         '40 88% 73%',     // #ffcb6b (yellow)
    'halo-error':           '355 53% 65%',    // #d95468 (red)
  } satisfies ThemeColors,
  preview: {
    background: '#292d3e',
    foreground: '#bfc7d5',
    primary:    '#c3aedc',
    accent:     '#f78c6c',
  },
}
