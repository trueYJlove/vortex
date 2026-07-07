import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Catppuccin — the soothing pastel theme for the high-spirited.
 * Uses Mocha (dark) flavor with warm pastels.
 * https://catppuccin.com/
 */
export const catppuccinMochaTheme: ThemeDefinition = {
  id: 'catppuccin-mocha',
  name: 'Catppuccin',
  type: 'dark',
  colors: {
    background:             '240 21% 15%',    // #1e1e2e (base)
    foreground:             '226 64% 88%',    // #cdd6f4 (text)
    card:                   '237 22% 18%',    // #24253a (mantle-like)
    'card-foreground':      '226 64% 88%',
    popover:                '237 22% 18%',
    'popover-foreground':   '226 64% 88%',
    primary:                '267 84% 81%',    // #cba6f7 (mauve)
    'primary-foreground':   '240 21% 15%',
    secondary:              '237 22% 23%',    // #313244 (surface0)
    'secondary-foreground': '226 64% 88%',
    muted:                  '237 22% 23%',
    'muted-foreground':     '231 11% 47%',    // #6c7086 (overlay0)
    accent:                 '217 92% 76%',    // #89b4fa (blue)
    'accent-foreground':    '240 21% 15%',
    destructive:            '344 65% 69%',    // #f38ba8 (red)
    'destructive-foreground': '240 21% 15%',
    border:                 '233 19% 31%',    // #45475a (surface1)
    input:                  '237 22% 23%',
    ring:                   '267 84% 81%',
    'halo-glow':            '267 84% 81%',
    'halo-success':         '115 54% 76%',    // #a6e3a1 (green)
    'halo-warning':         '41 86% 83%',     // #f9e2af (yellow)
    'halo-error':           '344 65% 69%',    // #f38ba8 (red)
  } satisfies ThemeColors,
  preview: {
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    primary:    '#cba6f7',
    accent:     '#89b4fa',
  },
}
