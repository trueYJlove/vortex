/**
 * Knowledge base REST API routes (remote access).
 * Mirrors the IPC handlers for remote mode file upload and management.
 */
import type { Express, Request, Response } from 'express'
import { getKnowledgeService } from '../../platform/memory'
import { broadcastToAll } from '../websocket'

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv', '.pdf'])

const EXTENSION_MAP: Record<string, string> = {
  '.txt': 'txt',
  '.md': 'md',
  '.json': 'json',
  '.csv': 'csv',
  '.pdf': 'pdf',
}

function getService() {
  const svc = getKnowledgeService()
  if (!svc) {
    throw new Error('KnowledgeService is not initialized')
  }
  return svc
}

export function registerKnowledgeRoutes(app: Express): void {
  // List documents for a space
  app.get('/api/knowledge/:spaceId', async (req: Request, res: Response) => {
    try {
      const docs = await getService().listDocuments(req.params.spaceId)
      res.json({ success: true, data: docs })
    } catch (error) {
      res.json({ success: false, error: (error as Error).message })
    }
  })

  // Search documents
  app.post('/api/knowledge/:spaceId/search', async (req: Request, res: Response) => {
    try {
      const { query, topK } = req.body
      if (!query || typeof query !== 'string') {
        res.status(400).json({ success: false, error: 'Missing query' })
        return
      }
      const results = await getService().search({
        scope: 'space',
        spaceId: req.params.spaceId,
        query,
        topK: topK ?? 5,
      })
      res.json({ success: true, data: results })
    } catch (error) {
      res.json({ success: false, error: (error as Error).message })
    }
  })

  // Delete a document
  app.delete('/api/knowledge/:spaceId', async (req: Request, res: Response) => {
    try {
      const { sourcePath } = req.body
      if (!sourcePath || typeof sourcePath !== 'string') {
        res.status(400).json({ success: false, error: 'Missing sourcePath' })
        return
      }
      await getService().removeDocument(req.params.spaceId, sourcePath)
      res.json({ success: true })
    } catch (error) {
      res.json({ success: false, error: (error as Error).message })
    }
  })

  // Upload and index documents (base64-encoded content)
  app.post('/api/knowledge/:spaceId/upload', async (req: Request, res: Response) => {
    try {
      const { files } = req.body as {
        files?: Array<{ name: string; content: string; type: string }>
      }

      if (!Array.isArray(files) || files.length === 0) {
        res.status(400).json({ success: false, error: 'No files provided' })
        return
      }

      const spaceId = req.params.spaceId
      const svc = getService()
      let indexed = 0
      let skipped = 0
      const errors: Array<{ file: string; error: string }> = []

      for (const file of files) {
        const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '')
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
          skipped++
          errors.push({ file: file.name, error: `Unsupported file type: ${ext}` })
          continue
        }

        const fileType = EXTENSION_MAP[ext]
        const content = Buffer.from(file.content, 'base64')

        broadcastToAll('knowledge:status', {
          spaceId,
          type: 'indexing',
          message: `Indexing ${file.name}`,
          sourcePath: file.name,
        })

        try {
          await svc.indexDocument({
            spaceId,
            source: 'upload',
            sourcePath: file.name,
            content: fileType === 'pdf' ? content : content.toString('utf-8'),
            fileType: fileType as any,
          })
          indexed++
          broadcastToAll('knowledge:status', {
            spaceId,
            type: 'complete',
            message: `Indexed ${file.name}`,
            sourcePath: file.name,
          })
        } catch (err) {
          skipped++
          const msg = err instanceof Error ? err.message : String(err)
          errors.push({ file: file.name, error: msg })
          broadcastToAll('knowledge:status', {
            spaceId,
            type: 'error',
            message: msg,
            sourcePath: file.name,
          })
        }
      }

      res.json({ success: true, data: { indexed, skipped, errors } })
    } catch (error) {
      res.json({ success: false, error: (error as Error).message })
    }
  })

  // Reindex all documents for a space
  app.post('/api/knowledge/:spaceId/reindex', async (req: Request, res: Response) => {
    try {
      const spaceId = req.params.spaceId
      console.log(`[Knowledge] knowledge:reindex — no-op (future feature)`)
      broadcastToAll('knowledge:status', {
        spaceId,
        type: 'complete',
        message: 'Re-index complete (no-op)',
      })
      res.json({ success: true })
    } catch (error) {
      res.json({ success: false, error: (error as Error).message })
    }
  })
}
