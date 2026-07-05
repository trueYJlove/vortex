import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * GitHub Dark theme — based on GitHub's official dark color scheme.
 * Deep blue-black background with the signature GitHub blue and green accents.
 */
export const githubDarkTheme: ThemeDefinition = {
  id: 'github-dark',
  name: 'GitHub Dark',
  type: 'dark',
  colors: {
    background:             '212 27% 7%',   // #0d1117 — GitHub dark background
    foreground:             '213 21% 78%',  // #c9d1d9 — GitHub default text
    card:                   '216 22% 10%',  // #161b22 — GitHub card surface
    'card-foreground':      '213 21% 78%',
    popover:                '216 22% 10%',
    'popover-foreground':   '213 21% 78%',
    primary:                '212 92% 55%',  // #1f6feb — GitHub blue
    'primary-foreground':   '0 0% 100%',
    secondary:              '216 22% 14%',  // #21262d — GitHub secondary
    'secondary-foreground': '213 21% 78%',
    muted:                  '216 22% 14%',
    'muted-foreground':     '213 12% 55%',  // #8b949e — GitHub muted text
    accent:                 '144 61% 44%',  // #238636 — GitHub green
    'accent-foreground':    '0 0% 100%',
    destructive:            '0 86% 60%',    // #f85149 — GitHub red
    'destructive-foreground': '0 0% 100%',
    border:                 '213 18% 24%',  // #30363d — GitHub border
    input:                  '216 22% 14%',
    ring:                   '212 92% 55%',
    'halo-glow':            '212 92% 55%',
    'halo-success':         '144 61% 44%',  // #238636 — GitHub green
    'halo-warning':         '37 90% 52%',   // #d29922 — GitHub yellow
    'halo-error':           '0 86% 60%',    // #f85149 — GitHub red
  } satisfies ThemeColors,
  preview: {
    background: '#0d1117',
    foreground: '#c9d1d9',
    primary:    '#1f6feb',
    accent:     '#238636',
  },
}
