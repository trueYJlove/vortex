import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Catppuccin Latte — warm, pastel light theme.
 * The light flavor of Catppuccin.
 * https://catppuccin.com/
 */
export const catppuccinLatteTheme: ThemeDefinition = {
  id: 'catppuccin-latte',
  name: 'Catppuccin Latte',
  type: 'light',
  colors: {
    background:             '30 48% 93%',    // #eff1f5 (base)
    foreground:             '234 20% 32%',    // #4c4f69 (text)
    card:                   '30 48% 95%',    // #e6e9ef (mantle)
    'card-foreground':      '234 20% 32%',
    popover:                '30 48% 95%',
    'popover-foreground':   '234 20% 32%',
    primary:                '266 85% 58%',    // #8839ef (mauve)
    'primary-foreground':   '30 48% 93%',
    secondary:              '229 59% 87%',    // #ccd0da (surface0)
    'secondary-foreground': '234 20% 32%',
    muted:                  '229 59% 87%',
    'muted-foreground':     '227 27% 52%',    // #9ca0b0 (overlay0)
    accent:                 '220 83% 53%',    // #1e66f5 (blue)
    'accent-foreground':    '30 48% 93%',
    destructive:            '347 70% 55%',    // #d20f39 (red)
    'destructive-foreground': '30 48% 93%',
    border:                 '228 28% 80%',    // #bcc0cc (surface1)
    input:                  '229 59% 87%',
    ring:                   '266 85% 58%',
    'halo-glow':            '266 85% 58%',
    'halo-success':         '109 48% 48%',    // #40a02b (green)
    'halo-warning':         '35 73% 55%',     // #df8e1d (yellow)
    'halo-error':           '347 70% 55%',    // #d20f39 (red)
  } satisfies ThemeColors,
  preview: {
    background: '#eff1f5',
    foreground: '#4c4f69',
    primary:    '#8839ef',
    accent:     '#1e66f5',
  },
}
