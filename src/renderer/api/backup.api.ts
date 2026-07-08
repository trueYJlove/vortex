/**
 * backupApi — backup/restore slice of the unified api object.
 * Desktop-only; remote mode returns a stub error. Renderer invokes with
 * no arguments — the main-side handler pops the Save/Open dialogs itself.
 */
import { isElectron } from './_shared'

export interface BackupResult {
  success: boolean
  error?: string
  /** Set when the user dismissed the Save/Open dialog without choosing. */
  canceled?: boolean
  /** True when the app exited without scheduling an automatic relaunch (dev mode). */
  requiresManualRestart?: boolean
}

export interface BackupProgress {
  phase: string
  percent?: number
}

export const backupApi = {
  backupExport: async (): Promise<BackupResult> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.halo.backupExport()
  },

  backupImport: async (): Promise<BackupResult> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.halo.backupImport()
  },

  onBackupProgress: (callback: (data: BackupProgress) => void) => {
    if (!isElectron()) {
      return () => {} // No-op in remote mode
    }
    return window.halo.onBackupProgress(callback)
  },
}
