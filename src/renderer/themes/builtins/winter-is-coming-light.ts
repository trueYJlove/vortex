import type { ThemeDefinition, ThemeColors } from '../registry'

/**
 * Winter is Coming Light — cool, minimalist light theme.
 * Blue-tinted white background with icy accents.
 * https://github.com/johnpapa/vscode-winteriscoming
 */
export const winterIsComingLightTheme: ThemeDefinition = {
  id: 'winter-is-coming-light',
  name: 'Winter is Coming (Light)',
  type: 'light',
  colors: {
    background:             '210 40% 98%',   // #f4f8fc (cool white)
    foreground:             '220 25% 22%',    // #2a3340 (dark navy text)
    card:                   '210 30% 95%',    // #eef3f8
    'card-foreground':      '220 25% 22%',
    popover:                '210 40% 98%',
    'popover-foreground':   '220 25% 22%',
    primary:                '200 100% 40%',   // #0099cc (ice blue)
    'primary-foreground':   '0 0% 100%',
    secondary:              '210 30% 92%',    // #e6ecf3
    'secondary-foreground': '220 25% 22%',
    muted:                  '210 30% 92%',
    'muted-foreground':     '214 15% 50%',    // #6d7a8a
    accent:                 '200 100% 45%',   // #00aae6 (frost blue)
    'accent-foreground':    '0 0% 100%',
    destructive:            '0 60% 50%',      // #cc3333
    'destructive-foreground': '0 0% 100%',
    border:                 '210 25% 85%',    // #d5dfe8
    input:                  '210 30% 92%',
    ring:                   '200 100% 40%',
    'halo-glow':            '200 100% 40%',
    'halo-success':         '150 50% 40%',    // #339966
    'halo-warning':         '30 80% 50%',     // #e68a22
    'halo-error':           '0 60% 50%',      // #cc3333
  } satisfies ThemeColors,
  preview: {
    background: '#f4f8fc',
    foreground: '#2a3340',
    primary:    '#0099cc',
    accent:     '#00aae6',
  },
}
