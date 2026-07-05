/**
 * AutomationBadge
 *
 * Compact status banner shown at the top of ConversationList.
 * Always renders the close button; optionally shows automation app status.
 *
 * - Always shows close button (when onClose provided)
 * - "● N apps running" when apps are active
 * - "⚠ <App name> needs your input" when an escalation is pending
 */

import { ChevronLeft } from 'lucide-react'
import { useAppsStore } from '../../stores/apps.store'
import { useAppsPageStore } from '../../stores/apps-page.store'
import { useAppStore } from '../../stores/app.store'
import { useTranslation } from '../../i18n'

interface AutomationBadgeProps {
  onClose?: () => void
  side?: 'left' | 'right'
}

export function AutomationBadge({ onClose, side = 'left' }: AutomationBadgeProps) {
  const { t } = useTranslation()
  const { setView } = useAppStore()
  const { apps } = useAppsStore()
  const { setInitialAppId } = useAppsPageStore()

  // Only show for automation-type apps
  const automationApps = apps.filter(a => a.spec.type === 'automation')

  // Priority: escalation waiting
  const waitingApp = automationApps.find(a => a.status === 'waiting_user')

  // Secondary: running / active apps count
  const runningApps = automationApps.filter(a => a.status === 'active' || a.status === 'error')

  const hasContent = waitingApp || runningApps.length > 0

  // No automation content — just render close button
  if (!hasContent) {
    if (!onClose) return null
    return (
      <div className="flex items-center justify-end px-3 py-2 border-b border-border">
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

  // Escalation waiting
  if (waitingApp) {
    const handleClick = () => {
      setInitialAppId(waitingApp.id)
      setView('apps')
    }
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-orange-400/20 bg-orange-400/10 hover:bg-orange-400/20 transition-colors">
        <button
          onClick={handleClick}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
          <span className="text-xs text-orange-300 truncate">
            {waitingApp.spec.name} — {t('needs your input')}
          </span>
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
            title={t('Close sidebar')}
          >
            <ChevronLeft className={`w-4 h-4 ${side === 'right' ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
    )
  }

  // Running apps
  const handleClick = () => {
    setView('apps')
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border hover:bg-secondary/50 transition-colors">
      <button
        onClick={handleClick}
        className="flex items-center gap-2 flex-1 min-w-0 text-left"
      >
        <span className="w-2 h-2 rounded-full bg-green-500/70 flex-shrink-0" />
        <span className="text-xs text-muted-foreground truncate">
          {runningApps.length === 1
            ? t('{{name}} running', { name: runningApps[0].spec.name })
            : t('{{count}} apps running', { count: runningApps.length })
          }
        </span>
      </button>
      {onClose && (
        <button
          onClick={onClose}
          className="p-1 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
          title={t('Close sidebar')}
        >
          <ChevronLeft className={`w-4 h-4 ${side === 'right' ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  )
}
