# Data Backup & Restore Design

> Date: 2026-07-08
> Status: Design approved
> Authors: vortex team

## 1. Overview

Add one-click full data backup and restore functionality, allowing users to migrate all application data (AI model configs, chat history, workspace info, digital human data, Claude config) when switching computers or reinstalling the OS.

The core approach is **full directory ZIP packaging**: archive the entire `~/.vortex/` data directory (or `VORTEX_DATA_DIR`) into a single `.zip` file, and restore by extracting the archive to overwrite the data directory.

## 2. Data Layout

| Data | Path (relative to `~/.vortex/`) | Format |
|---|---|---|
| AI model config + API keys | `config.json` | JSON (credentials encrypted at rest via `cred.key`) |
| Master key / keyring | `cred.key` | Binary |
| Space index | `spaces-index.json` | JSON |
| Space data | `spaces/<id>/` | JSON (conversations, meta, thoughts files) |
| App/Runtime data | `vortex.db` | SQLite |
| Claude config | `claude-config/` | JSON files |

### Excluded from backup

- `temp/` — Runtime temp space, no persistent value
- `store-cache/` — Store registry cache, auto-regenerated
- `*.wal`, `*.shm` — SQLite WAL artifacts (VACUUM before packing)
- `logs/` — Runtime logs, not needed for migration

## 3. Dependencies

The project currently has **no ZIP library** in `package.json`. The artifact route uses raw `gzip` as a fallback and has explicit TODOs to use `archiver` for proper ZIP creation.

**Decision:** Add two new dependencies:
- `archiver` (v7+) — streaming ZIP creation for export
- `unzipper` (v0.12+) — streaming ZIP extraction for import

Both are mature, widely used, and work well with streaming (no memory blowup on large archives). They will be added to `dependencies` (not `devDependencies`) since they're used in the main process at runtime.

## 4. Export Flow

```
User clicks "Export Backup"
  → System save dialog (default: vortex-backup-YYYY-MM-DD.zip)
  → Main process:
      1. Quiesce in-memory state:
         - Flush conversation cache to disk (write-through cache already does this,
           but call a sync flush to be safe)
         - Debounced index writes: force a final write now
      2. SQLite checkpoint: PRAGMA wal_checkpoint(TRUNCATE) + VACUUM on vortex.db
         (ensures all WAL data is flushed to the main DB file, shrinking the archive)
      3. Stream ZIP via archiver:
         - Walk getHaloDir() recursively
         - Skip excluded paths (temp/, store-cache/, logs/, *.wal, *.shm)
         - All other files written with paths relative to getHaloDir()
      4. Write to user-chosen path
  → Completion toast notification
```

### Technical details

- `archiver` streams files directly into the ZIP; memory usage stays flat regardless of archive size
- SQLite VACUUM compact the database file, which can significantly reduce archive size for apps with heavy churn
- File paths inside the ZIP are relative to `getHaloDir()`, so extraction on restore produces the correct structure
- The `cred.key` file is included so encrypted credentials can be decrypted on the target machine

## 5. Import Flow

```
User clicks "Import Restore"
  → System open dialog (filter: *.zip)
  → Confirmation dialog:
      "This will overwrite all current data (configs, conversations, workspaces, etc.)
       and restart the application. Continue?"
  → Main process:
      1. Pre-flight: verify the archive is a valid ZIP and contains expected top-level
         entries (at minimum: config.json OR spaces-index.json). Reject otherwise.
      2. Quiesce all writers:
         - Clear conversation cache (drop in-memory copies; nothing unreadable on disk)
         - Cancel any pending debounced index writes
         - Pause space registry mutations
      3. Close all SQLite connections via platform/store `closeAll()`
      4. Backup current data dir to ~/.vortex-backup-<timestamp>/ (for rollback)
         - Only if current dir has content (skip on fresh-install imports)
      5. Wipe getHaloDir() contents (excluding the backup copy and the source zip)
      6. Stream-extract archive into getHaloDir() using unzipper
      7. Delete any *.wal/*.shm files that may have been packed (they're stale)
      8. Relaunch via app.relaunch() + app.exit(0)
  → App restarts with restored data
```

### Rollback safety

- Before extraction, the current `~/.vortex/` is copied to `~/.vortex-backup-<timestamp>/`
- If extraction fails mid-way (zip error, disk full), restore from the backup copy and report error
- On successful relaunch, the temp backup is removed on next startup
- If rollback itself fails, surface the backup path to the user so they can recover manually

### Why "wipe + extract" instead of "extract over"

Extracting over an existing directory leaves orphaned files (e.g., old spaces that don't exist in the backup, old config keys that were removed). Wiping first ensures the restored state is a faithful copy of the source machine.

## 6. UI Design

### Entry point

Settings page, new "Data Management" section placed after existing sections:

```
┌─────────────────────────────────────┐
│  数据管理 / Data Management         │
│                                     │
│  [ 导出备份 Export Backup ]        │
│  [ 导入恢复 Import Restore ]        │
└─────────────────────────────────────┘
```

### Export interaction

1. Click "Export Backup" → system save dialog → progress state on button → toast on success

### Import interaction

1. Click "Import Restore" → system open dialog (`.zip`)
2. Confirmation modal with warning text → confirm → processing → app relaunch

### Responsive

- Buttons are full-width on mobile (`w-full`), auto on `sm:` breakpoint
- Confirmation modal reflows on small viewports (existing modal pattern)

## 7. IPC Channel Design

### Request APIs (main process)

| Channel | Direction | Payload | Description |
|---|---|---|---|
| `backup:export` | renderer → main | `{ savePath: string }` | Export backup to path |
| `backup:import` | renderer → main | `{ filePath: string }` | Import backup from path |

### Event channels (main → renderer)

| Channel | Payload | Description |
|---|---|---|
| `backup:progress` | `{ phase: string, percent?: number }` | Progress update during export/import |
| `backup:complete` | `{ success: boolean, error?: string }` | Export/import result |

## 8. Implementation Files

| File | Role |
|---|---|
| `src/main/services/backup.service.ts` | Core backup/restore logic (pack, extract, SQLite prep, writer quiesce, rollback) |
| `src/main/ipc/backup.ts` | IPC handlers for backup:export and backup:import |
| `src/renderer/components/settings/DataManagementSection.tsx` | UI section with Export/Import buttons |
| `src/renderer/api/index.ts` | API bridge (ipcRenderer calls) |
| `src/preload/index.ts` | Preload bridge exports |

### Sync checklist

- Add `archiver` and `unzipper` to `package.json` dependencies
- `src/main/services/backup.service.ts` — new file, core logic
- `src/main/ipc/backup.ts` — new file, register IPC handlers
- `src/main/index.ts` — register backup IPC module
- `src/preload/index.ts` — expose `backupApi`
- `src/renderer/api/index.ts` — add `backupApi` calls
- `src/renderer/components/settings/nav-config.ts` — add "Data Management" nav entry
- `src/renderer/components/settings/SettingsPage.tsx` — render new section
- `src/renderer/components/settings/DataManagementSection.tsx` — new UI component

## 9. Open Questions

- Should we add an option to encrypt the backup archive with a user-supplied password? (ZIP encryption via `archiver` is weak; would need `zip-encrypted` or similar.) **Default: no, defer until user requests.**
- Should we expose a CLI flag for headless backup (e.g., `vortex --export-backup <path>`)? **Default: no, settings UI is sufficient for v1.**
