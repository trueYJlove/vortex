/**
 * Workflow IPC Handlers
 *
 * Exposes workflow execution history (runs + node details) to the renderer
 * for the Execution Replay feature.
 *
 * Channels:
 *   workflow:list-runs     List workflow runs for an app
 *   workflow:get-run       Get a single workflow run by runId
 *   workflow:get-node-runs List node runs for a workflow run
 */
import { workflowRpc } from '../../shared/rpc/contracts/workflow.contract'
import { registerRawRpcHandlers } from './rpc'
import { getWorkflowStore } from '../apps/runtime'

export function registerWorkflowHandlers(): void {
  registerRawRpcHandlers(workflowRpc, {
    // ── workflow:list-runs ──────────────────────────────────────────────
    workflowListRuns: (appId: string, limit?: number) => {
      const store = getWorkflowStore()
      if (!store) return { success: false, error: 'WorkflowStore not initialized' }
      const runs = store.getWorkflowRunsForApp(appId, limit)
      return { success: true, data: runs }
    },

    // ── workflow:get-run ────────────────────────────────────────────────
    workflowGetRun: (runId: string) => {
      const store = getWorkflowStore()
      if (!store) return { success: false, error: 'WorkflowStore not initialized' }
      const run = store.getWorkflowRun(runId)
      return { success: true, data: run }
    },

    // ── workflow:get-node-runs ──────────────────────────────────────────
    workflowGetNodeRuns: (runId: string) => {
      const store = getWorkflowStore()
      if (!store) return { success: false, error: 'WorkflowStore not initialized' }
      const nodeRuns = store.getNodeRunsForRun(runId)
      return { success: true, data: nodeRuns }
    },
  })

  console.log('[WorkflowIPC] Workflow handlers registered (3 channels)')
}