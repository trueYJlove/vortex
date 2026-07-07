import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Night Owl — accessible dark theme for night-time coding.
 * Designed to be easy on the eyes with reduced blue light.
 * https://github.com/sdras/night-owl-vscode-theme
 */
export const nightOwlTheme: ThemeDefinition = {
  id: 'night-owl',
  name: 'Night Owl',
  type: 'dark',
  colors: {
    background:             '230 27% 10%',    // #011627 (editor bg)
    foreground:             '220 14% 73%',    // #d6deeb (fg)
    card:                   '230 33% 14%',    // #011c34 (sidebar)
    'card-foreground':      '220 14% 73%',
    popover:                '230 33% 14%',
    'popover-foreground':   '220 14% 73%',
    primary:                '201 100% 77%',   // #82aaff (keyword blue)
    'primary-foreground':   '230 27% 10%',
    secondary:              '221 36% 19%',    // #1d3b53
    'secondary-foreground': '220 14% 73%',
    muted:                  '221 36% 19%',
    'muted-foreground':     '220 10% 45%',    // #5f7e97 (comment)
    accent:                 '30 100% 70%',    // #f78c6c (orange string)
    'accent-foreground':    '230 27% 10%',
    destructive:            '355 65% 65%',    // #ef5350 (error)
    'destructive-foreground': '230 27% 10%',
    border:                 '224 26% 22%',    // #1d3547 (border)
    input:                  '221 36% 19%',
    ring:                   '201 100% 77%',
    'halo-glow':            '201 100% 77%',
    'halo-success':         '95 38% 63%',     // #addb67 (green)
    'halo-warning':         '40 100% 70%',    // #ffd472
    'halo-error':           '355 65% 65%',    // #ef5350
  } satisfies ThemeColors,
  preview: {
    background: '#011627',
    foreground: '#d6deeb',
    primary:    '#82aaff',
    accent:     '#f78c6c',
  },
}
