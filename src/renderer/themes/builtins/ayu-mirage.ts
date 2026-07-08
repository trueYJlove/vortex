import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Ayu Mirage — balanced, comfortable dark theme.
 * Moderate contrast, warm accent tones, easy on the eyes.
 * https://github.com/ayu-theme/ayu-colors
 */
export const ayuMirageTheme: ThemeDefinition = {
  id: 'ayu-mirage',
  name: 'Ayu Mirage',
  type: 'dark',
  colors: {
    background:             '220 16% 17%',    // #1f2430 (common.bg)
    foreground:             '210 28% 78%',    // #cbccc6 (syntax.fg)
    card:                   '220 16% 20%',    // #252a38
    'card-foreground':      '210 28% 78%',
    popover:                '220 16% 20%',
    'popover-foreground':   '210 28% 78%',
    primary:                '35 70% 69%',     // #ffcc66 (syntax.func)
    'primary-foreground':   '220 16% 17%',
    secondary:              '222 15% 24%',    // #2a3040
    'secondary-foreground': '210 28% 78%',
    muted:                  '222 15% 24%',
    'muted-foreground':     '220 8% 40%',     // #5c6166 (syntax.comment)
    accent:                 '206 62% 58%',    // #5ccfe6 (syntax.tag)
    'accent-foreground':    '220 16% 17%',
    destructive:            '10 53% 56%',     // #d95757 (syntax.error)
    'destructive-foreground': '220 16% 17%',
    border:                 '222 15% 30%',    // #343a4a (guide)
    input:                  '222 15% 24%',
    ring:                   '35 70% 69%',
    'halo-glow':            '35 70% 69%',
    'halo-success':         '85 30% 57%',     // #a8cc8c (adjusted green)
    'halo-warning':         '35 70% 69%',     // #ffcc66
    'halo-error':           '10 53% 56%',     // #d95757
  } satisfies ThemeColors,
  preview: {
    background: '#1f2430',
    foreground: '#cbccc6',
    primary:    '#ffcc66',
    accent:     '#5ccfe6',
  },
}
