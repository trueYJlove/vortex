/**
 * Data Management Section Component
 *
 * One-click full data backup/restore for migration between computers or
 * after an OS reinstall. The main-side handlers pop the Save/Open dialogs
 * themselves, so the renderer invokes the operations with no arguments.
 *
 * Backup exports the entire `~/.vortex/` data directory (AI configs, chat
 * history, workspaces, digital humans, Claude config) as a single ZIP.
 * Import overwrites the current data dir from a backup archive and
 * relaunches the app.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Download,
  Upload,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Database,
} from 'lucide-react'
import { useTranslation } from '../../i18n'
import { api } from '../../api'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import { useNotificationStore } from '../../stores/notification.store'

export function DataManagementSection() {
  const { t } = useTranslation()
  const { showConfirm, DialogComponent } = useConfirmDialog()
  const showToast = useNotificationStore((s) => s.show)

  // Phase → human-readable label. Using English text as the i18n key.
  const PHASE_LABELS: Record<string, string> = {
    'quiescing-writers': t('Flushing in-memory state'),
    'sqlite-checkpoint': t('Compacting database'),
    'archiving': t('Archiving files'),
    'pre-flight': t('Validating archive'),
    'closing-db': t('Closing database'),
    'backing-up-current': t('Backing up current data'),
    'wiping-target': t('Preparing restore target'),
    'extracting': t('Extracting archive'),
    'finalizing': t('Finalizing restore'),
  }
  const [operation, setOperation] = useState<'idle' | 'exporting' | 'importing'>('idle')
  const [progress, setProgress] = useState<{ phase: string; percent?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Subscribe to backup:progress events from the main process. The listener
  // is registered once and cleaned up on unmount; we gate updates by the
  // current operation so a stale event from a prior session can't flip the
  // UI into a phantom progress state.
  useEffect(() => {
    const unsub = api.onBackupProgress((data) => {
      setProgress({ phase: data.phase, percent: data.percent })
    })
    return () => { unsub() }
  }, [])

  const resetProgress = () => {
    setProgress(null)
    setError(null)
  }

  const handleExport = useCallback(async () => {
    if (operation !== 'idle') return
    setOperation('exporting')
    resetProgress()
    try {
      const result = await api.backupExport()
      if (result.canceled) {
        // User dismissed the Save dialog — silent, no toast.
        return
      }
      if (!result.success) {
        const msg = result.error || t('Export failed')
        setError(msg)
        showToast({ title: t('Backup export failed'), body: msg, variant: 'error', duration: 8000 })
        return
      }
      showToast({
        title: t('Backup exported'),
        body: t('Your data has been saved to the chosen file.'),
        variant: 'success',
        duration: 6000,
      })
    } catch (err) {
      const msg = String(err)
      setError(msg)
      showToast({ title: t('Backup export failed'), body: msg, variant: 'error', duration: 8000 })
    } finally {
      setOperation('idle')
      resetProgress()
    }
  }, [operation, showToast, t])

  const handleImport = useCallback(async () => {
    if (operation !== 'idle') return

    const confirmed = await showConfirm({
      title: t('Restore from backup?'),
      message: t('This will overwrite ALL current data (AI model configs, chat history, workspaces, digital humans, Claude config) and restart Vortex. This cannot be undone.'),
      confirmLabel: t('Restore & Restart'),
      cancelLabel: t('Cancel'),
      variant: 'danger',
    })
    if (!confirmed) return

    setOperation('importing')
    resetProgress()
    try {
      const result = await api.backupImport()
      if (result.canceled) {
        // User dismissed the Open dialog — silent.
        return
      }
      if (!result.success) {
        const msg = result.error || t('Restore failed')
        setError(msg)
        showToast({ title: t('Backup restore failed'), body: msg, variant: 'error', duration: 10000 })
        // Import failed — back to idle so the user can retry.
        setOperation('idle')
        resetProgress()
        return
      }
      // Success: main process schedules app.relaunch() + app.exit(0) in
      // production, or just app.exit(0) in dev (dev server can't relaunch).
      showToast({
        title: t('Restore complete'),
        body: result.requiresManualRestart
          ? t('Restore complete. Please restart Vortex manually.')
          : t('Vortex will restart now to load the restored data.'),
        variant: 'success',
        duration: 0,
      })
      // Do NOT flip back to idle — the process is exiting.
    } catch (err) {
      const msg = String(err)
      setError(msg)
      showToast({ title: t('Backup restore failed'), body: msg, variant: 'error', duration: 10000 })
      setOperation('idle')
      resetProgress()
    }
  }, [operation, showConfirm, showToast, t])

  const isBusy = operation !== 'idle'
  const phaseLabel = progress ? PHASE_LABELS[progress.phase] || progress.phase : null

  return (
    <>
      <section id="data-management" className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          {t('Data Management')}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t('Back up or restore all your data — AI model configs, chat history, workspaces, and digital humans — for migration or safekeeping.')}
        </p>

        {/* Info banner */}
        <div className="bg-muted/50 rounded-lg p-3 mb-4 text-sm text-muted-foreground">
          {t('Export packs the entire data directory into a single ZIP file. Import overwrites the current data and restarts Vortex.')}
        </div>

        {/* Progress indicator (shared by export and import) */}
        {isBusy && (
          <div className="mb-4 flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <Loader2 className="w-4 h-4 mt-0.5 animate-spin shrink-0 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary">
                {operation === 'exporting' ? t('Exporting backup...') : t('Restoring backup...')}
              </p>
              {phaseLabel && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {phaseLabel}
                  {typeof progress?.percent === 'number' && ` · ${progress.percent}%`}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && !isBusy && (
          <div className="mb-4 flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">{t('Operation failed')}</p>
              <p className="text-xs text-destructive/80 mt-0.5 break-words">{error}</p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={isBusy}
            className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('Export all data to a single ZIP file')}
          >
            {operation === 'exporting' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {t('Export Backup')}
          </button>

          <button
            type="button"
            onClick={handleImport}
            disabled={isBusy}
            className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('Restore data from a backup file — overwrites current data and restarts')}
          >
            {operation === 'importing' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {t('Import Restore')}
          </button>
        </div>

        {/* After-import hint (shown only when import succeeded and process is about to exit) */}
        {operation === 'importing' && (
          <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
            {t("Don't close the window — Vortex will restart automatically.")}
          </p>
        )}
      </section>

      {/* Confirm dialog portal (for the import confirmation) */}
      {DialogComponent}
    </>
  )
}
