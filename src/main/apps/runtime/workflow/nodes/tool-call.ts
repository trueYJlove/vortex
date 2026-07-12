/**
 * apps/runtime/workflow/nodes -- Tool Call Node Executor
 *
 * Executes a tool_call step: resolves params, looks up the MCP tool handler,
 * calls it, and returns the result.
 */

import type { ToolCallStep } from '../../../spec/schema'
import type { WorkflowContext, NodeRunResult } from '../types'
import { resolveObject } from '../context'

// ============================================
// Types
// ============================================

/**
 * A callable tool handler.
 * Receives resolved params and returns the tool's output.
 */
export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>

export interface ToolCallDeps {
  /** Map of tool name → handler function */
  tools: Record<string, ToolHandler>
}

// ============================================
// Executor
// ============================================

/**
 * Execute a tool_call node.
 *
 * 1. Resolve variables in step.params
 * 2. Find tool handler by step.tool name
 * 3. Call tool with resolved params
 * 4. Return NodeRunResult with tool output
 */
export async function executeToolCallNode(
  step: ToolCallStep,
  context: WorkflowContext,
  deps: ToolCallDeps,
): Promise<NodeRunResult> {
  // Resolve params
  const resolvedParams = step.params
    ? resolveObject(step.params, context)
    : {}

  // Find tool handler
  const handler = deps.tools[step.tool]
  if (!handler) {
    return {
      nodeId: step.id,
      status: 'error',
      output: {},
      error: `Tool not found: ${step.tool}`,
    }
  }

  try {
    const result = await handler(resolvedParams)
    return {
      nodeId: step.id,
      status: 'completed',
      output: { result },
    }
  } catch (err) {
    return {
      nodeId: step.id,
      status: 'error',
      output: {},
      error: err instanceof Error ? err.message : String(err),
    }
  }
}