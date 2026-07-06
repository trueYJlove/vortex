/**
 * AutomationBadge
 *
 * Compact header for the ConversationList sidebar.
 * Shows interaction area label and close button.
 * Automation status is shown in StatusBar instead.
 */

import { ChevronLeft } from 'lucide-react'
import { useTranslation } from '../../i18n'

interface AutomationBadgeProps {
  onClose?: () => void
  side?: 'left' | 'right'
}

export function AutomationBadge({ onClose, side = 'left' }: AutomationBadgeProps) {
  const { t } = useTranslation()

  if (!onClose) return null

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border">
      <span className="text-sm sm:text-[14px] text-muted-foreground">{t('Interaction area')}</span>
      <button
        onClick={onClose}
        className="p-1 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
        title={t('Close sidebar')}
      >
        <ChevronLeft className={`w-4 h-4 ${side === 'right' ? 'rotate-180' : ''}`} />
      </button>
    </div>
  )
}
