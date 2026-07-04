import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Catppuccin Mocha theme — the soothing pastel theme for the high-spirited.
 * https://catppuccin.com/
 * Uses Mocha flavor (dark) with its signature warm pastel palette.
 */
export const catppuccinMochaTheme: ThemeDefinition = {
  id: 'catppuccin-mocha',
  name: 'Catppuccin Mocha',
  type: 'dark',
  colors: {
    background:             '240 21% 15%',    // #1e1e2e (base)
    foreground:             '230 34% 88%',    // #cdd6f4 (text)
    card:                   '237 22% 18%',    // #24253a — between base and surface0
    'card-foreground':      '230 34% 88%',
    popover:                '237 22% 18%',
    'popover-foreground':   '230 34% 88%',
    primary:                '270 78% 82%',    // #cba6f7 (mauve)
    'primary-foreground':   '240 21% 15%',    // base — for contrast
    secondary:              '237 22% 23%',    // #313244 (surface0)
    'secondary-foreground': '230 34% 88%',
    muted:                  '237 22% 23%',
    'muted-foreground':     '233 17% 47%',    // #6c7086 (overlay0)
    accent:                 '214 94% 80%',    // #89b4fa (blue)
    'accent-foreground':    '240 21% 15%',
    destructive:            '343 85% 75%',    // #f38ba8 (red)
    'destructive-foreground': '240 21% 15%',
    border:                 '233 17% 31%',    // #45475a (surface1)
    input:                  '237 22% 23%',
    ring:                   '270 78% 82%',
    'halo-glow':            '270 78% 82%',
    'halo-success':         '116 52% 76%',    // #a6e3a1 (green)
    'halo-warning':         '39 88% 83%',     // #f9e2af (yellow)
    'halo-error':           '343 85% 75%',    // #f38ba8 (red)
  } satisfies ThemeColors,
  preview: {
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    primary:    '#cba6f7',
    accent:     '#89b4fa',
  },
}
