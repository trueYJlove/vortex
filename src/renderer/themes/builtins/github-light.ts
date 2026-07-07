import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * GitHub Light — clean, crisp light theme.
 * Based on GitHub's official light color scheme.
 */
export const githubLightTheme: ThemeDefinition = {
  id: 'github-light',
  name: 'GitHub Light',
  type: 'light',
  colors: {
    background:             '0 0% 100%',    // #ffffff
    foreground:             '216 12% 14%',   // #1f2328 (fg.default)
    card:                   '210 14% 97%',   // #f6f8fa (canvas.subtle)
    'card-foreground':      '216 12% 14%',
    popover:                '0 0% 100%',
    'popover-foreground':   '216 12% 14%',
    primary:                '211 100% 37%',  // #0969da (accent.fg)
    'primary-foreground':   '0 0% 100%',
    secondary:              '210 14% 93%',   // #ebedf0 (border.default)
    'secondary-foreground': '216 12% 14%',
    muted:                  '210 14% 93%',
    'muted-foreground':     '210 6% 42%',    // #656d76 (fg.muted)
    accent:                 '136 52% 42%',   // #1a7f37 (success.fg)
    'accent-foreground':    '0 0% 100%',
    destructive:            '359 68% 44%',   // #cf222e (danger.fg)
    'destructive-foreground': '0 0% 100%',
    border:                 '210 14% 85%',   // #d0d7de (border.default)
    input:                  '210 14% 93%',
    ring:                   '211 100% 37%',
    'halo-glow':            '211 100% 37%',
    'halo-success':         '136 52% 42%',   // #1a7f37
    'halo-warning':         '40 74% 50%',    // #bf8700
    'halo-error':           '359 68% 44%',   // #cf222e
  } satisfies ThemeColors,
  preview: {
    background: '#ffffff',
    foreground: '#1f2328',
    primary:    '#0969da',
    accent:     '#1a7f37',
  },
}
