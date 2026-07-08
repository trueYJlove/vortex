import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * GitHub Dark High Contrast — accessibility-focused dark theme.
 *
 * Based on GitHub's official high-contrast dark color scheme, designed for
 * users who need maximum readability. Uses deep blacks, high-luminance
 * foregrounds, and strong border contrast instead of relying solely on color.
 */
export const githubDarkHighContrastTheme: ThemeDefinition = {
  id: 'github-dark-high-contrast',
  name: 'GitHub Dark High Contrast',
  type: 'dark',
  colors: {
    background:             '0 0% 5%',     // #0d0d0d — near-black
    foreground:             '0 0% 95%',    // #f0f0f0 — high-luminance text
    card:                   '0 0% 8%',     // #141414 — subtle elevation
    'card-foreground':      '0 0% 95%',
    popover:                '0 0% 8%',
    'popover-foreground':   '0 0% 95%',
    primary:                '211 100% 66%', // #409fff — bright blue, WCAG AAA
    'primary-foreground':   '0 0% 5%',
    secondary:              '0 0% 13%',    // #212121
    'secondary-foreground': '0 0% 95%',
    muted:                  '0 0% 13%',
    'muted-foreground':     '0 0% 70%',    // #b3b3b3 — readable secondary
    accent:                 '39 100% 60%', // #ffa633 — warm accent with contrast
    'accent-foreground':    '0 0% 5%',
    destructive:            '0 90% 60%',   // #f03333 — bright red
    'destructive-foreground': '0 0% 100%',
    border:                 '0 0% 30%',    // #4d4d4d — visible borders
    input:                  '0 0% 13%',
    ring:                   '211 100% 66%',
    'halo-glow':            '211 100% 66%',
    'halo-success':         '120 70% 55%', // #4ddb4d
    'halo-warning':         '45 100% 60%', // #ffcc33
    'halo-error':           '0 90% 60%',   // #f03333
  } satisfies ThemeColors,
  preview: {
    background: '#0d0d0d',
    foreground: '#f0f0f0',
    primary:    '#409fff',
    accent:     '#ffa633',
  },
}
