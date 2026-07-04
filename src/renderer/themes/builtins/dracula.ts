import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Dracula theme — based on the official Dracula color palette.
 * https://draculatheme.com/contribute
 */
export const draculaTheme: ThemeDefinition = {
  id: 'dracula',
  name: 'Dracula',
  type: 'dark',
  colors: {
    background:             '231 17% 14%',    // #282a36
    foreground:             '252 100% 88%',   // #f8f8f2
    card:                   '232 19% 17%',    // #2d2f3b — subtle elevation
    'card-foreground':      '252 100% 88%',
    popover:                '232 19% 17%',
    'popover-foreground':   '252 100% 88%',
    primary:                '265 100% 75%',   // #bd93f9
    'primary-foreground':   '0 0% 100%',
    secondary:              '231 17% 22%',    // #393c4d — slightly more distinct
    'secondary-foreground': '252 100% 88%',
    muted:                  '231 17% 22%',
    'muted-foreground':     '220 14% 56%',    // #6272a4
    accent:                 '326 100% 74%',   // #ff79c6
    'accent-foreground':    '0 0% 100%',
    destructive:            '0 100% 68%',     // #ff5555
    'destructive-foreground': '0 0% 100%',
    border:                 '231 17% 28%',    // #44475a — clear separation
    input:                  '231 17% 22%',
    ring:                   '265 100% 75%',
    'halo-glow':            '265 100% 75%',
    'halo-success':         '135 100% 63%',   // #50fa7b
    'halo-warning':         '44 100% 67%',    // #f1fa8c
    'halo-error':           '0 100% 68%',     // #ff5555
  } satisfies ThemeColors,
  preview: {
    background: '#282a36',
    foreground: '#f8f8f2',
    primary:    '#bd93f9',
    accent:     '#ff79c6',
  },
}
