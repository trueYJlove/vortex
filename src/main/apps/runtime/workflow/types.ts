/**
 * apps/runtime/workflow -- Type Definitions
 *
 * Types for the workflow DAG execution engine.
 * WorkflowStep types are imported from the spec layer.
 */
import type { TriggerContext } from '../types'
import type { WorkflowStep } from '../../spec/schema'

/**
 * Runtime context passed through the entire workflow execution.
 * Accumulates step outputs as the DAG progresses.
 */
export interface WorkflowContext {
  /** The trigger that started this workflow run */
  trigger: Record<string, unknown>
  /** Memory snapshot — read once at workflow start */
  memory: Record<string, unknown>
  /**
   * Accumulated step outputs, keyed by node id.
   * Each entry maps field names to values produced by that step.
   */
  steps: Record<string, Record<string, unknown>>
}

/**
 * Result produced by executing a single workflow node.
 */
export interface NodeRunResult {
  nodeId: string
  status: 'completed' | 'error' | 'skipped'
  output: Record<string, unknown>
  error?: string
  /** For condition nodes: the resolved next node id */
  nextNodeId?: string
}

/**
 * Error thrown when a variable reference cannot be resolved
 * in the current workflow context.
 */
export class VariableResolutionError extends Error {
  constructor(reference: string) {
    super(`Unresolvable variable reference: ${reference}`)
    this.name = 'VariableResolutionError'
  }
}

// Re-export WorkflowStep for convenience
export type { WorkflowStep }