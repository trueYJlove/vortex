/**
 * Bridge between the backup service and the platform store.
 *
 * The backup service lives in `services/` and must not import `platform/store`
 * directly (architecture §2: dependencies flow downward only). The store
 * exposes two narrow helpers here that the backup service needs: closing all
 * SQLite connections before extraction, and a sidecar checkpoint+VACUUM for
 * export. The store registers its implementation at bootstrap via
 * `setStoreBackupBridge`; the backup service calls through the getter.
 */

import type Database from 'better-sqlite3'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

export interface StoreBackupBridge {
  /** Close all SQLite connections held by the platform store. */
  closeAll(): void
  /** Open a one-shot connection to `dbPath`, run WAL checkpoint + VACUUM, close. */
  checkpointAndVacuum(dbPath: string): void
  /** Return the absolute path to the app-level database file, or null if the store hasn't been initialized. */
  getDbPath(): string | null
}

let bridge: StoreBackupBridge | null = null

export function setStoreBackupBridge(b: StoreBackupBridge): void {
  bridge = b
}

function requireBridge(): StoreBackupBridge {
  if (!bridge) {
    throw new Error('[backup-bridge] Store bridge not registered. Was initStore() called?')
  }
  return bridge
}

export function closeStoreForBackup(): void {
  requireBridge().closeAll()
}

export function getStoreDbPath(): string | null {
  return bridge ? bridge.getDbPath() : null
}

/**
 * Open a sidecar SQLite connection, run `PRAGMA wal_checkpoint(TRUNCATE)` and
 * `VACUUM`, then close it. Uses better-sqlite3 directly so it doesn't disturb
 * any connection the store currently holds open for app traffic.
 */
export function checkpointAndVacuumDb(dbPath: string): void {
  const BetterSqlite3 = require('better-sqlite3')
  const db: Database = new BetterSqlite3(dbPath)
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.exec('VACUUM')
  } finally {
    db.close()
  }
}
