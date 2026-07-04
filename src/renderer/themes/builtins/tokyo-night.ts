import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Tokyo Night theme — inspired by VS Code Tokyo Night.
 * https://github.com/enkia/tokyo-night-vscode-theme
 */
export const tokyoNightTheme: ThemeDefinition = {
  id: 'tokyo-night',
  name: 'Tokyo Night',
  type: 'dark',
  colors: {
    background:             '235 28% 13%',    // #1a1b26
    foreground:             '226 24% 75%',    // #a9b1d6
    card:                   '232 22% 15%',    // #1f2335 — elevated surface
    'card-foreground':      '226 24% 75%',
    popover:                '232 22% 15%',
    'popover-foreground':   '226 24% 75%',
    primary:                '218 67% 69%',    // #7aa2f7
    'primary-foreground':   '0 0% 100%',
    secondary:              '235 20% 18%',    // #292e42
    'secondary-foreground': '226 24% 75%',
    muted:                  '235 20% 18%',
    'muted-foreground':     '227 22% 50%',    // #565f89
    accent:                 '218 55% 44%',    // #3d59a1
    'accent-foreground':    '0 0% 100%',
    destructive:            '348 87% 73%',    // #f7768e
    'destructive-foreground': '0 0% 100%',
    border:                 '235 22% 21%',    // #3b4261
    input:                  '235 20% 18%',
    ring:                   '218 67% 69%',
    'halo-glow':            '218 67% 69%',
    'halo-success':         '93 54% 64%',     // #9ece6a
    'halo-warning':         '35 71% 65%',     // #e0af68
    'halo-error':           '348 87% 73%',    // #f7768e
  } satisfies ThemeColors,
  preview: {
    background: '#1a1b26',
    foreground: '#a9b1d6',
    primary:    '#7aa2f7',
    accent:     '#3d59a1',
  },
}
