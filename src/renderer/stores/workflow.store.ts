/**
 * Workflow Store — manages workflow execution history for the Execution Replay UI.
 */
import { create } from 'zustand'
import { api } from '../api'
import type { WorkflowRun, WorkflowNodeRun } from '../api/workflow.api'

interface WorkflowState {
  // Data
  runs: WorkflowRun[]
  selectedRun: WorkflowRun | null
  nodeRuns: WorkflowNodeRun[]
  isLoading: boolean
  isNodeLoading: boolean
  error: string | null

  // Actions
  loadRuns: (appId: string, limit?: number) => Promise<void>
  selectRun: (run: WorkflowRun | null) => void
  loadNodeRuns: (runId: string) => Promise<void>
  clear: () => void
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  runs: [],
  selectedRun: null,
  nodeRuns: [],
  isLoading: false,
  isNodeLoading: false,
  error: null,

  loadRuns: async (appId: string, limit?: number) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.workflowListRuns(appId, limit)
      if (res.success && res.data) {
        set({ runs: res.data as WorkflowRun[], isLoading: false })
      } else {
        set({ error: res.error || 'Failed to load workflow runs', isLoading: false })
      }
    } catch (err) {
      set({ error: String(err), isLoading: false })
    }
  },

  selectRun: (run: WorkflowRun | null) => {
    set({ selectedRun: run, nodeRuns: [] })
    if (run) {
      get().loadNodeRuns(run.runId)
    }
  },

  loadNodeRuns: async (runId: string) => {
    set({ isNodeLoading: true, error: null })
    try {
      const res = await api.workflowGetNodeRuns(runId)
      if (res.success && res.data) {
        set({ nodeRuns: res.data as WorkflowNodeRun[], isNodeLoading: false })
      } else {
        set({ error: res.error || 'Failed to load node runs', isNodeLoading: false })
      }
    } catch (err) {
      set({ error: String(err), isNodeLoading: false })
    }
  },

  clear: () => {
    set({ runs: [], selectedRun: null, nodeRuns: [], isLoading: false, isNodeLoading: false, error: null })
  },
}))