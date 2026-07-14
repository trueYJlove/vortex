/**
 * CommandPaletteButton — entry point for the global command palette.
 *
 * Shows a Command icon with a Ctrl+K hint tooltip. Clicking opens the
 * command panel store. Designed to sit in Header `right` slot alongside
 * other action buttons.
 */

import { Command } from 'lucide-react'
import { useCommandPanelStore } from '../../stores/command-panel.store'
import { useTranslation } from '../../i18n'

export function CommandPaletteButton() {
  const { t } = useTranslation()
  const open = useCommandPanelStore((s) => s.open)

  return (
    <button
      onClick={open}
      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
      title={t('Command Palette (Ctrl+Shift+P)')}
      aria-label={t('Command Palette')}
    >
      <Command size={18} />
    </button>
  )
}
