/**
 * Workflow REST API routes (remote access).
 * Mirrors the workflow IPC surface for execution history queries.
 */
import type { Express, Request, Response } from 'express'
import { getWorkflowStore } from '../../apps/runtime'

export function registerWorkflowRoutes(app: Express): void {
  // List workflow runs for a given app
  app.get('/api/workflow/runs', (req: Request, res: Response) => {
    const appId = req.query.appId as string | undefined
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
    if (!appId) {
      res.status(400).json({ success: false, error: 'Missing appId query parameter' })
      return
    }
    const store = getWorkflowStore()
    if (!store) {
      res.status(503).json({ success: false, error: 'WorkflowStore not initialized' })
      return
    }
    const runs = store.getWorkflowRunsForApp(appId, limit)
    res.json({ success: true, data: runs })
  })

  // Get a single workflow run by runId
  app.get('/api/workflow/runs/:runId', (req: Request, res: Response) => {
    const store = getWorkflowStore()
    if (!store) {
      res.status(503).json({ success: false, error: 'WorkflowStore not initialized' })
      return
    }
    const run = store.getWorkflowRun(req.params.runId)
    res.json({ success: true, data: run })
  })

  // List node runs for a workflow run
  app.get('/api/workflow/runs/:runId/nodes', (req: Request, res: Response) => {
    const store = getWorkflowStore()
    if (!store) {
      res.status(503).json({ success: false, error: 'WorkflowStore not initialized' })
      return
    }
    const nodeRuns = store.getNodeRunsForRun(req.params.runId)
    res.json({ success: true, data: nodeRuns })
  })
}