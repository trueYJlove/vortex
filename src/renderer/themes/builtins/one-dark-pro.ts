import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * One Dark Pro theme — based on Atom's One Dark syntax theme.
 * https://github.com/Binaryify/OneDark-Pro
 */
export const oneDarkProTheme: ThemeDefinition = {
  id: 'one-dark-pro',
  name: 'One Dark Pro',
  type: 'dark',
  colors: {
    background:             '216 17% 19%',    // #282c34
    foreground:             '218 13% 71%',    // #abb2bf
    card:                   '216 17% 22%',    // #2c313c — subtle elevation
    'card-foreground':      '218 13% 71%',
    popover:                '216 17% 22%',
    'popover-foreground':   '218 13% 71%',
    primary:                '207 90% 66%',    // #61afef
    'primary-foreground':   '0 0% 100%',
    secondary:              '216 17% 24%',    // #333844
    'secondary-foreground': '218 13% 71%',
    muted:                  '216 17% 24%',
    'muted-foreground':     '219 10% 50%',    // #636d83
    accent:                 '284 58% 66%',    // #c678dd
    'accent-foreground':    '0 0% 100%',
    destructive:            '352 62% 64%',    // #e06c75
    'destructive-foreground': '0 0% 100%',
    border:                 '216 17% 28%',    // #3e4451
    input:                  '216 17% 24%',
    ring:                   '207 90% 66%',
    'halo-glow':            '207 90% 66%',
    'halo-success':         '99 35% 62%',     // #98c379
    'halo-warning':         '41 60% 70%',     // #e5c07b
    'halo-error':           '352 62% 64%',    // #e06c75
  } satisfies ThemeColors,
  preview: {
    background: '#282c34',
    foreground: '#abb2bf',
    primary:    '#61afef',
    accent:     '#c678dd',
  },
}
