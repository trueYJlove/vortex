/**
 * Backup IPC Handlers — export/import Vortex data archives.
 *
 * The handlers pop the system Save/Open dialogs themselves (mirroring
 * `store:export-dhpkg`), so the renderer invokes them with no arguments.
 * They return the standard envelope themselves so the import handler can
 * fire `app.relaunch()` after sending the final response instead of
 * resolving the promise after the relaunch (which would never reach the
 * renderer before the process exits).
 */

import { ipcMain, dialog, app } from 'electron'
import { backupRpc } from '../../shared/rpc/contracts/backup.contract'
import { exportBackup, importBackup } from '../services/backup.service'
import { getMainWindow } from '../foundation/window.service'

function emitProgress(phase: string, percent?: number): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send('backup:progress', { phase, percent })
}

export function registerBackupHandlers(): void {
  ipcMain.handle(backupRpc.backupExport.channel, async () => {
    console.log('[Backup] IPC:export:start — opening save dialog')
    // Default file name: vortex-backup-YYYY-MM-DD.zip
    const today = new Date().toISOString().slice(0, 10)
    const dialogResult = await dialog.showSaveDialog({
      title: 'Export Vortex Backup',
      defaultPath: `vortex-backup-${today}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    })
    if (dialogResult.canceled || !dialogResult.filePath) {
      return { success: false, canceled: true }
    }
    const savePath = dialogResult.filePath
    const result = await exportBackup(savePath, (p) => emitProgress(p.phase, p.percent))
    if (result.success) {
      console.log('[Backup] IPC:export:success —', savePath)
    } else {
      console.error('[Backup] IPC:export:failure:', result.error)
    }
    return result
  })

  ipcMain.handle(backupRpc.backupImport.channel, async () => {
    console.log('[Backup] IPC:import:start — opening file dialog')
    const dialogResult = await dialog.showOpenDialog({
      title: 'Import Vortex Backup',
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      properties: ['openFile'],
    })
    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return { success: false, canceled: true }
    }
    const filePath = dialogResult.filePaths[0]
    const result = await importBackup(filePath, (p) => emitProgress(p.phase, p.percent))
    if (!result.success) {
      console.error('[Backup] IPC:import:failure:', result.error)
      return result
    }
    // Send the success envelope BEFORE relaunching so the renderer has a
    // chance to show the "restarting" toast before the process exits.
    console.log('[Backup] IPC:import:success — scheduling relaunch')
    setImmediate(() => {
      app.relaunch()
      app.exit(0)
    })
    return { success: true }
  })

  console.log('[Backup] Backup handlers registered')
}
