import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Kanagawa — warm, vintage-inspired dark theme.
 * Inspired by the woodblock print "The Great Wave off Kanagawa"
 * by Hokusai Katsushika.
 * https://github.com/rebelot/kanagawa.nvim
 */
export const kanagawaTheme: ThemeDefinition = {
  id: 'kanagawa',
  name: 'Kanagawa',
  type: 'dark',
  colors: {
    background:             '219 18% 15%',    // #1f1f28 (sumiInk0)
    foreground:             '45 23% 69%',     // #dcd7ba (fujiWhite)
    card:                   '228 19% 19%',    // #252535 (waveBlue1)
    'card-foreground':      '45 23% 69%',
    popover:                '228 19% 19%',
    'popover-foreground':   '45 23% 69%',
    primary:                '355 22% 63%',    // #c34043 (samuraiRed)
    'primary-foreground':   '219 18% 15%',
    secondary:              '230 23% 24%',    // #363646 (waveBlue2)
    'secondary-foreground': '45 23% 69%',
    muted:                  '230 23% 24%',
    'muted-foreground':     '226 15% 44%',    // #54546d (fujiGray)
    accent:                 '217 63% 70%',    // #7e9cd8 (crystalBlue)
    'accent-foreground':    '219 18% 15%',
    destructive:            '2 42% 52%',      // #c34043 ↓
    'destructive-foreground': '45 23% 69%',
    border:                 '227 19% 29%',    // #43436d (waveBlue3)
    input:                  '230 23% 24%',
    ring:                   '355 22% 63%',
    'halo-glow':            '355 22% 63%',
    'halo-success':         '85 30% 57%',     // #98bb6c (springGreen)
    'halo-warning':         '42 66% 63%',     // #e6c384 (carpYellow)
    'halo-error':           '2 42% 52%',      // #c34043 (samuraiRed)
  } satisfies ThemeColors,
  preview: {
    background: '#1f1f28',
    foreground: '#dcd7ba',
    primary:    '#c34043',
    accent:     '#7e9cd8',
  },
}
