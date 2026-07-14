/**
 * WindowControls - Custom minimize/maximize/close buttons for Windows/Linux.
 *
 * macOS uses native traffic lights (titleBarStyle: 'hiddenInset'), so this
 * component renders nothing on macOS. On Windows/Linux it replaces the
 * native titleBarOverlay, giving fully themed, DOM-based window controls.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isElectron } from '../../api/transport'
import { api } from '../../api'

// Replicate platform detection (avoid circular dependency with Header)
const getPlatform = () => {
  if (typeof window !== 'undefined' && window.platform) {
    return window.platform
  }
  return {
    platform: 'darwin' as const,
    isMac: true,
    isWindows: false,
    isLinux: false,
  }
}

type WinState = 'normal' | 'maximized'

export function WindowControls() {
  const [winState, setWinState] = useState<WinState>('normal')
  const platform = getPlatform()
  const { t } = useTranslation()

  // Only render on Windows/Linux Electron
  if (!isElectron() || platform.isMac) {
    return null
  }

  // Subscribe to maximize changes
  useEffect(() => {
    api.isWindowMaximized().then((res) => {
      if (res.success && res.data) {
        setWinState('maximized')
      }
    }).catch(() => {})

    const unsub = api.onWindowMaximizeChange((maximized) => {
      setWinState(maximized ? 'maximized' : 'normal')
    })
    return () => unsub()
  }, [])

  return (
    <div className="window-controls no-drag flex items-stretch h-full">
      <button
        className="window-control-btn"
        onClick={() => api.minimizeWindow()}
        aria-label={t('Minimize')}
        title={t('Minimize')}
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="2" y="5.5" width="8" height="1" fill="currentColor" />
        </svg>
      </button>

      <button
        className="window-control-btn"
        onClick={() => api.toggleMaximizeWindow()}
        aria-label={winState === 'maximized' ? t('Restore') : t('Maximize')}
        title={winState === 'maximized' ? t('Restore') : t('Maximize')}
      >
        {winState === 'maximized' ? (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="3.5" y="1" width="7.5" height="7.5" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1" />
            <rect x="1" y="3.5" width="7.5" height="7.5" rx="0.5" fill="hsl(var(--background))" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="1.5" y="1.5" width="9" height="9" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>

      <button
        className="window-control-btn window-control-btn-close"
        onClick={() => api.closeWindow()}
        aria-label={t('Close')}
        title={t('Close')}
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
          <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  )
}