/**
 * StatusBar — Compact bottom bar showing contextual information.
 *
 * Displays:
 * - Left: Current AI model name
 * - Right: Theme name, platform indicator
 *
 * Uses theme tokens only, no hardcoded colors.
 * Height: 24px (compact, VSCode-style).
 */

import { useTranslation } from '../../i18n'
import { useAppStore } from '../../stores/app.store'
import { getCurrentModelName } from '../../types'
import { getTheme, resolveSystemTheme } from '../../themes/registry'
import { isElectron, isCapacitor } from '../../api/transport'

export function StatusBar() {
  const { t } = useTranslation()
  const config = useAppStore(s => s.config)

  const aiSources = config?.aiSources
  const currentModel = aiSources ? getCurrentModelName(aiSources) : null

  const themeId = config?.appearance?.theme || 'dark'
  const resolvedId = themeId === 'system' ? resolveSystemTheme() : themeId
  const theme = getTheme(resolvedId)

  const platformLabel = isElectron()
    ? window.platform?.isMac ? 'macOS' : window.platform?.isWindows ? 'Windows' : 'Linux'
    : isCapacitor()
      ? 'Mobile'
      : 'Web'

  return (
    <div
      className="fixed bottom-0 inset-x-0 h-6 flex items-center justify-between px-3 border-t border-border bg-background text-[11px] text-muted-foreground select-none z-40 safe-area-bottom"
      style={{ paddingBottom: 'max(0px, var(--sab))' }}
    >
      {/* Left: Model info */}
      <div className="flex items-center gap-2 min-w-0">
        {currentModel && (
          <span className="truncate max-w-[180px] sm:max-w-none" title={currentModel}>
            {currentModel}
          </span>
        )}
      </div>

      {/* Right: Theme + Platform */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {theme && (
          <span className="hidden sm:inline">
            {t(theme.name)}
          </span>
        )}
        <span className="text-muted-foreground/70">
          {platformLabel}
        </span>
      </div>
    </div>
  )
}
