/**
 * Backup RPC contract.
 *
 * Both request APIs take no arguments — the main-side handlers pop the
 * system Save/Open dialogs themselves (mirroring `store:export-dhpkg`),
 * so the renderer just triggers the operation. The handlers return the
 * passthrough envelope themselves because `importBackup` may need to
 * relaunch the app before resolving — see ipc/backup.ts.
 *
 * `backupImport` returns `requiresManualRestart: true` when running in
 * dev (unpackaged) mode: the Electron process will exit, but there is no
 * packaged binary to relaunch, so the user must restart `npm run dev`
 * manually. The renderer uses this flag to pick the right toast message.
 */
import { rawRpcMethod } from '../define'

export interface BackupImportResult {
  success: boolean
  error?: string
  canceled?: boolean
  /** True when the app exited without scheduling an automatic relaunch. */
  requiresManualRestart?: boolean
}

export const backupRpc = {
  backupExport: rawRpcMethod<[], { success: boolean; error?: string; canceled?: boolean }>('backup:export'),
  backupImport: rawRpcMethod<[], BackupImportResult>('backup:import'),
}
