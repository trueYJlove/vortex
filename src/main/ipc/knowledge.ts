/**
 * Knowledge Base IPC Handlers
 *
 * Exposes KnowledgeService operations to the renderer process.
 * Uses the singleton pattern via getKnowledgeService().
 *
 * Channels:
 *   knowledge:list      List all documents in a space
 *   knowledge:search    Search documents by query
 *   knowledge:delete    Delete a document by ID
 *   knowledge:upload    Upload and index a new document
 *   knowledge:reindex   Re-index all documents for a space
 *   knowledge:status    Event — emitted when indexing completes or errors
 */
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'
import { statSync } from 'fs'
import { extname } from 'path'
import { getKnowledgeService } from '../platform/memory/'
import { knowledgeRpc } from '../../shared/rpc/contracts/knowledge.contract'
import { registerRawRpcHandlers } from './rpc'

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv', '.pdf'])

const EXTENSION_MAP: Record<string, string> = {
  '.txt': 'txt',
  '.md': 'md',
  '.json': 'json',
  '.csv': 'csv',
  '.pdf': 'pdf',
}

// 50MB upload limit — matches the KnowledgeBasePanel UX requirement.
// Larger files would block the main thread during parsing + chunking
// and blow up memory on resource-constrained devices.
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

function getService() {
  const svc = getKnowledgeService()
  if (!svc) {
    throw new Error('KnowledgeService is not initialized')
  }
  return svc
}

/** Emit knowledge:status event to all renderer windows */
function emitStatus(status: { spaceId: string; type: 'indexing' | 'complete' | 'error'; message: string; sourcePath?: string }) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('knowledge:status', status)
  }
}

export function registerKnowledgeHandlers(): void {
  registerRawRpcHandlers(knowledgeRpc, {
    // ── knowledge:list ──────────────────────────────────────────────────
    knowledgeList: async (spaceId: string) => {
      const svc = getService()
      const docs = await svc.listDocuments(spaceId)
      return { success: true, data: docs }
    },

    // ── knowledge:search ────────────────────────────────────────────────
    knowledgeSearch: async (params: { spaceId: string; query: string; topK?: number }) => {
      const svc = getService()
      const results = await svc.search({
        scope: 'space',
        spaceId: params.spaceId,
        query: params.query,
        topK: params.topK ?? 5,
      })
      return { success: true, data: results }
    },

    // ── knowledge:delete ────────────────────────────────────────────────
    knowledgeDelete: async (params: { spaceId: string; sourcePath: string }) => {
      const svc = getService()
      await svc.removeDocument(params.spaceId, params.sourcePath)
      return { success: true }
    },

    // ── knowledge:upload ────────────────────────────────────────────────
    knowledgeUpload: async (params: { spaceId: string }) => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Documents', extensions: ['txt', 'md', 'json', 'csv', 'pdf'] },
        ],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, data: { indexed: 0, skipped: 0 } }
      }

      const svc = getService()
      let indexed = 0
      let skipped = 0
      const errors: Array<{ file: string; error: string }> = []

      for (const filePath of result.filePaths) {
        const ext = extname(filePath).toLowerCase()
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
          skipped++
          continue
        }

        let size = 0
        try {
          size = statSync(filePath).size
        } catch {
          skipped++
          const msg = `Cannot stat ${filePath}`
          errors.push({ file: filePath, error: msg })
          emitStatus({ spaceId: params.spaceId, type: 'error', message: msg, sourcePath: filePath })
          continue
        }
        if (size > MAX_FILE_SIZE_BYTES) {
          skipped++
          const msg = `File too large (max 50MB): ${filePath}`
          errors.push({ file: filePath, error: msg })
          emitStatus({ spaceId: params.spaceId, type: 'error', message: msg, sourcePath: filePath })
          continue
        }

        const fileType = EXTENSION_MAP[ext]
        const content = fileType !== 'pdf'
          ? await readFile(filePath, 'utf-8')
          : await readFile(filePath)

        emitStatus({ spaceId: params.spaceId, type: 'indexing', message: `Indexing ${filePath}`, sourcePath: filePath })

        try {
          await svc.indexDocument({
            spaceId: params.spaceId,
            source: 'upload',
            sourcePath: filePath,
            content,
            fileType: fileType as any,
          })
          indexed++
          emitStatus({ spaceId: params.spaceId, type: 'complete', message: `Indexed ${filePath}`, sourcePath: filePath })
        } catch (err) {
          skipped++
          const msg = err instanceof Error ? err.message : String(err)
          errors.push({ file: filePath, error: msg })
          emitStatus({ spaceId: params.spaceId, type: 'error', message: msg, sourcePath: filePath })
        }
      }

      return { success: true, data: { indexed, skipped, errors } }
    },

    // ── knowledge:reindex ───────────────────────────────────────────────
    knowledgeReindex: async (spaceId: string) => {
      // Re-indexing is a future feature — for now, return success with no-op
      console.log('[KnowledgeIPC] knowledge:reindex — no-op (future feature)')
      emitStatus({ spaceId, type: 'complete', message: 'Re-index complete (no-op)' })
      return { success: true }
    },
  })

  console.log('[KnowledgeIPC] Knowledge base handlers registered (5 channels + status event)')
}