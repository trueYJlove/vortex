/**
 * Backup Service — one-click full data export/import.
 *
 * Wraps the entire `~/.vortex/` data directory into a single ZIP archive
 * (export) and restores it by extracting the archive over the data dir
 * (import). Designed for migration between machines or OS reinstalls.
 *
 * Excluded from the archive:
 *   - `temp/` — runtime temp space
 *   - `store-cache/` — store registry cache
 *   - `logs/` — runtime logs
 *   - `*.wal`, `*.shm` — SQLite WAL artifacts (VACUUM before packing)
 *
 * The export flow flushes in-memory writers (conversation cache + debounced
 * index writes) and checkpoints `vortex.db` before zipping, so the archive
 * captures a consistent snapshot. The import flow quiesces writers, closes all
 * SQLite connections, backs up the current dir for rollback, wipes the dir,
 * and extracts. The caller (IPC handler) is responsible for relaunching the
 * app after a successful import.
 */

import { join, relative } from 'path'
import {
  createWriteStream,
  createReadStream,
  existsSync,
  readdirSync,
  mkdirSync,
  rmSync,
  renameSync,
  copyFileSync,
  unlinkSync,
} from 'fs'
import { ZipArchive } from 'archiver'
// unzipper 是 CJS 包，用 createRequire 在 ESM 环境加载。
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const unzipper = require('unzipper') as typeof import('unzipper')
import { getHaloDir } from '../foundation/config.service'
import { flushAllPendingIndexWrites } from './conversation.service'
import { closeStoreForBackup, getStoreDbPath, checkpointAndVacuumDb } from '../platform/store'

// Progress phases surfaced to the renderer via the `backup:progress` event.
export type BackupPhase =
  | 'quiescing-writers'
  | 'sqlite-checkpoint'
  | 'archiving'
  | 'pre-flight'
  | 'closing-db'
  | 'backing-up-current'
  | 'wiping-target'
  | 'extracting'
  | 'finalizing'

export interface BackupProgress {
  phase: BackupPhase
  /** 0..100 — optional, only when a phase has measurable progress. */
  percent?: number
}

export interface BackupResult {
  success: boolean
  error?: string
}

// Paths excluded from the archive, relative to `getHaloDir()`. Matched by
// path prefix on the relative path; suffix matches are used for SQLite WAL
// sidecar files. SQLite uses `<db>-wal` and `<db>-shm` naming (e.g.
// `vortex.db-wal`, `vortex.db-shm`), so the bare `.wal` / `.shm` suffixes
// never match — use `.db-wal`, `.db-shm` instead.
const EXCLUDED_DIRS = new Set(['temp', 'store-cache', 'logs'])
const EXCLUDED_SUFFIXES = ['.db-wal', '.db-shm', '.tmp']

type ProgressEmitter = (progress: BackupProgress) => void

/**
 * Walk `dir` and invoke `onFile` for every file. Directories listed in
 * `EXCLUDED_DIRS` are pruned; files whose names end with an excluded suffix
 * are skipped. The walk is depth-first and deterministic via `readdirSync`
 * ordering (sorted for reproducibility).
 */
function walkDataDir(
  dir: string,
  root: string,
  onFile: (absPath: string, relPath: string) => void,
): void {
  let entries: import('fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    console.error(`[Backup] Cannot read directory ${dir}:`, error)
    return
  }
  // Sort for deterministic archive ordering.
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    const absPath = join(dir, entry.name)
    const relPath = relative(root, absPath)
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(relPath)) {
        continue
      }
      walkDataDir(absPath, root, onFile)
    } else if (entry.isFile()) {
      if (EXCLUDED_SUFFIXES.some((suf) => entry.name.endsWith(suf))) {
        continue
      }
      onFile(absPath, relPath)
    }
  }
}

/**
 * Force a SQLite WAL checkpoint + VACUUM on `vortex.db` so the archive
 * contains a compacted main DB file and no WAL/SHM data is left behind.
 * Errors are logged but never abort the export — a running app still has
 * its data on disk, and missing this step only makes the archive slightly
 * stale (WAL content not yet flushed).
 */
function checkpointSqlite(): void {
  try {
    const dbPath = getStoreDbPath()
    if (!dbPath) {
      console.warn('[Backup] Store not initialized; skipping SQLite checkpoint.')
      return
    }
    // Open a sidecar connection so we don't disturb the live app database
    // (better-sqlite3 keeps a single connection per file). Closing this
    // connection flushes WAL before the archive walk reads the file.
    checkpointAndVacuumDb(dbPath)
    console.log('[Backup] SQLite checkpoint + VACUUM complete')
  } catch (error) {
    console.warn('[Backup] SQLite checkpoint failed (continuing):', error)
  }
}

/**
 * Export the full data directory to `savePath` as a ZIP archive.
 * `onProgress` receives phase updates (currently only `archiving` emits
 * one final `percent: 100` on success — archiver does not expose byte-level
 * progress without instrumentation we don't need for v1).
 */
export async function exportBackup(savePath: string, onProgress?: ProgressEmitter): Promise<BackupResult> {
  const haloDir = getHaloDir()
  console.log(`[Backup] Exporting ${haloDir} → ${savePath}`)

  try {
    // Phase 1: flush in-memory writers.
    onProgress?.({ phase: 'quiescing-writers' })
    flushAllPendingIndexWrites()

    // Phase 2: SQLite checkpoint + VACUUM.
    onProgress?.({ phase: 'sqlite-checkpoint' })
    checkpointSqlite()

    // Phase 3: stream ZIP.
    onProgress?.({ phase: 'archiving' })
    const output = createWriteStream(savePath)
    const archive = new ZipArchive({ zlib: { level: 6 } })

    return new Promise((resolve) => {
      output.on('close', () => {
        console.log(`[Backup] Archive complete: ${archive.pointer()} bytes`)
        onProgress?.({ phase: 'archiving', percent: 100 })
        resolve({ success: true })
      })
      output.on('error', (err) => {
        console.error('[Backup] Output stream error:', err)
        try { unlinkSync(savePath) } catch { /* already gone */ }
        resolve({ success: false, error: err.message })
      })
      archive.on('warning', (warn: { code?: string; message: string }) => {
        console.warn('[Backup] Archiver warning:', warn)
      })
      archive.on('error', (err: Error) => {
        console.error('[Backup] Archiver error:', err)
        try { unlinkSync(savePath) } catch { /* already gone */ }
        resolve({ success: false, error: err.message })
      })

      archive.pipe(output)

      walkDataDir(haloDir, haloDir, (absPath, relPath) => {
        archive.file(absPath, { name: relPath })
      })

      archive.finalize()
    })
  } catch (error) {
    console.error('[Backup] Export failed:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Quick pre-flight: peek at the archive's central directory to ensure it is a
 * valid ZIP containing at least one of `config.json` or `spaces-index.json`.
 * This avoids wiping the data dir before discovering the archive is garbage.
 */
async function preFlightCheck(zipPath: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const directory = await unzipper.Open.file(zipPath)
    const files = directory.files
    const hasConfigJson = files.some((f) => f.path === 'config.json')
    const hasSpacesIndex = files.some((f) => f.path === 'spaces-index.json')
    if (!hasConfigJson && !hasSpacesIndex) {
      return { ok: false, reason: 'archive is missing config.json and spaces-index.json — not a Vortex backup' }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: `cannot open archive: ${String(error)}` }
  }
}

/**
 * Copy the entire data dir into `<parent>/vortex-backup-<timestamp>/`.
 * Used by import for rollback safety. Returns the backup path or null if
 * the source dir does not exist (e.g. fresh-install import).
 */
function backupCurrentDataDir(): string | null {
  const haloDir = getHaloDir()
  if (!existsSync(haloDir)) return null

  const parent = join(haloDir, '..')
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(parent, `vortex-backup-${ts}`)

  try {
    mkdirSync(backupPath, { recursive: true })
    // Recursive copy, skipping the same files we exclude from export (they
    // are not needed for rollback — the data they describe is regenerable).
    const copyDir = (src: string, dst: string): void => {
      const entries = readdirSync(src, { withFileTypes: true })
      for (const entry of entries) {
        const s = join(src, entry.name)
        const d = join(dst, entry.name)
        if (entry.isDirectory()) {
          if (EXCLUDED_DIRS.has(entry.name)) continue
          mkdirSync(d, { recursive: true })
          copyDir(s, d)
        } else if (entry.isFile()) {
          if (EXCLUDED_SUFFIXES.some((suf) => entry.name.endsWith(suf))) continue
          copyFileSync(s, d)
        }
      }
    }
    copyDir(haloDir, backupPath)
    console.log(`[Backup] Rolled-back data backed up to ${backupPath}`)
    return backupPath
  } catch (error) {
    console.error(`[Backup] Failed to back up current data dir:`, error)
    // Try to remove the partial backup so a failed copy doesn't leave junk.
    try {
      rmSync(backupPath, { recursive: true, force: true })
    } catch {
      // Swallow; the outer caller will report a failure either way.
    }
    return null
  }
}

/**
 * Wipe the data directory in preparation for extraction. Excluded dirs
 * (`temp/`, `store-cache/`, `logs/`) are removed too — extraction will
 * either recreate them or they will be regenerated on next startup.
 */
function wipeDataDir(): void {
  const haloDir = getHaloDir()
  if (!existsSync(haloDir)) return
  const entries = readdirSync(haloDir, { withFileTypes: true })
  for (const entry of entries) {
    rmSync(join(haloDir, entry.name), { recursive: true, force: true })
  }
}

/**
 * Remove any stale WAL/SHM files that may have been packed by a zip tool
 * that ignored our exclusions. Safe to delete — SQLite recreates them on
 * next open, and a checkpoint was (presumably) done before export.
 *
 * SQLite sidecar naming is `<dbname>-wal` / `<dbname>-shm` (e.g.
 * `vortex.db-wal`, `vortex.db-shm`), not `<dbname>.wal`. Match both the
 * canonical SQLite suffix and the legacy `.wal`/`.shm` form defensively.
 */
function purgeWalShm(): void {
  const haloDir = getHaloDir()
  if (!existsSync(haloDir)) return
  const purge = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        purge(abs)
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('-wal') ||
          entry.name.endsWith('-shm') ||
          entry.name.endsWith('.wal') ||
          entry.name.endsWith('.shm'))
      ) {
        try {
          rmSync(abs, { force: true })
        } catch {
          // Best-effort cleanup; SQLite tolerates missing sidecar files.
        }
      }
    }
  }
  purge(haloDir)
}

/**
 * Import a backup archive, overwriting the current data directory.
 *
 * Steps:
 *   pre-flight → quiesce writers → close DBs → back up current → wipe →
 *   extract → purge stale WAL/SHM → finalize.
 *
 * The caller is responsible for `app.relaunch()` after a `success: true`.
 * Rollback: on extraction failure, restores from the pre-import backup if
 * one was taken, and returns `{ success: false, error }`.
 */
export async function importBackup(zipPath: string, onProgress?: ProgressEmitter): Promise<BackupResult> {
  console.log(`[Backup] Importing from ${zipPath}`)
  try {
    // Phase 1: pre-flight validation.
    onProgress?.({ phase: 'pre-flight' })
    const pre = await preFlightCheck(zipPath)
    if (!pre.ok) {
      return { success: false, error: pre.reason }
    }

    // Phase 2: flush in-memory writers.
    onProgress?.({ phase: 'quiescing-writers' })
    flushAllPendingIndexWrites()

    // Phase 3: close all SQLite connections (no more writes after this).
    onProgress?.({ phase: 'closing-db' })
    try {
      closeStoreForBackup()
    } catch (error) {
      console.warn('[Backup] DB close failed (continuing — may not have been open):', error)
    }

    // Phase 4: back up current dir for rollback.
    onProgress?.({ phase: 'backing-up-current' })
    const backupPath = backupCurrentDataDir()
    if (backupPath === null && existsSync(getHaloDir())) {
      // Dir exists but backup failed mid-way — abort to avoid data loss.
      return { success: false, error: 'failed to back up current data; import aborted to prevent data loss' }
    }

    // Phase 5: wipe target dir.
    onProgress?.({ phase: 'wiping-target' })
    wipeDataDir()

    // Phase 6: extract archive.
    onProgress?.({ phase: 'extracting' })
    try {
      const haloDir = getHaloDir()
      mkdirSync(haloDir, { recursive: true })
      await new Promise<void>((resolveExtract, rejectExtract) => {
        createReadStream(zipPath)
          .pipe(unzipper.Extract({ path: haloDir }))
          .on('close', () => resolveExtract())
          .on('error', (err) => rejectExtract(err))
      })
    } catch (error) {
      console.error('[Backup] Extraction failed:', error)
      // Rollback if we have a backup.
      if (backupPath) {
        console.log(`[Backup] Rolling back from ${backupPath}`)
        try {
          wipeDataDir()
          renameSync(backupPath, getHaloDir())
        } catch (rollbackError) {
          console.error('[Backup] Rollback ALSO failed:', rollbackError)
          return {
            success: false,
            error: `extraction failed (${String(error)}) and rollback also failed: ${String(rollbackError)}. Manual recovery from ${backupPath} may be required.`,
          }
        }
        return { success: false, error: `extraction failed; rolled back to previous state. (${String(error)})` }
      }
      return { success: false, error: `extraction failed: ${String(error)}` }
    }

    // Phase 7: purge any stale WAL/SHM files that snuck in via the archive.
    onProgress?.({ phase: 'finalizing' })
    purgeWalShm()

    console.log('[Backup] Import succeeded; caller should relaunch the app')
    return { success: true }
  } catch (error) {
    console.error('[Backup] Import failed (unexpected):', error)
    return { success: false, error: String(error) }
  }
}
