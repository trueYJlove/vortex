/**
 * workflowApi — workflow execution history domain slice of the unified api object.
 */
import { httpRequest, isElectron } from './_shared'
import type { ApiResponse } from './_shared'

export interface WorkflowRun {
  runId: string
  appId: string
  status: 'running' | 'completed' | 'error'
  triggerType: string
  triggerData?: Record<string, unknown>
  flowDefinitionJson: string
  startedAt: number
  finishedAt?: number
  durationMs?: number
  errorMessage?: string
}

export interface WorkflowNodeRun {
  id: string
  runId: string
  appId: string
  stepId: string
  stepType: string
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped'
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  startedAt: number
  finishedAt?: number
  durationMs?: number
}

export const workflowApi = {
  workflowListRuns: async (appId: string, limit?: number): Promise<ApiResponse<WorkflowRun[]>> => {
    if (isElectron()) {
      return window.halo.workflowListRuns(appId, limit)
    }
    const query = new URLSearchParams({ appId })
    if (limit !== undefined) query.set('limit', String(limit))
    return httpRequest('GET', `/api/workflow/runs?${query.toString()}`)
  },

  workflowGetRun: async (runId: string): Promise<ApiResponse<WorkflowRun>> => {
    if (isElectron()) {
      return window.halo.workflowGetRun(runId)
    }
    return httpRequest('GET', `/api/workflow/runs/${runId}`)
  },

  workflowGetNodeRuns: async (runId: string): Promise<ApiResponse<WorkflowNodeRun[]>> => {
    if (isElectron()) {
      return window.halo.workflowGetNodeRuns(runId)
    }
    return httpRequest('GET', `/api/workflow/runs/${runId}/nodes`)
  },
}