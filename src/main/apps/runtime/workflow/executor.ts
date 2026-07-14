/**
 * apps/runtime/workflow -- DAG Execution Engine
 *
 * Executes a workflow defined as an ordered array of steps.
 * - Linear steps (llm_call, tool_call) proceed in array order
 * - Condition steps redirect to a target step via goto/default
 * - Each node execution is recorded in the WorkflowStore for observability
 * - Supports parallel dispatch of fan-out branches
 */

import type { InstalledApp } from '../../manager'
import type {
  WorkflowStep,
  LlmCallStep,
  ToolCallStep,
  ConditionStep,
} from '../../../spec/schema'
import type { TriggerContext, AppRunResult } from '../types'
import type { WorkflowStore, UpdateWorkflowRunInput, NodeRunStatus } from './store'
import type { WorkflowContext } from './types'
import { executeLlmCallNode, type LlmCallDeps } from './nodes/llm-call'
import { executeToolCallNode, type ToolCallDeps } from './nodes/tool-call'
import { executeConditionNode } from './nodes/condition'
import { RunExecutionError } from '../errors'
import type { MemoryService, MemoryCallerScope } from '../../../platform/memory'
import { buildMemorySnapshot, type MemorySnapshot } from '../../../platform/memory/snapshot'
import { getSpace } from '../../../services/space.service'

// ============================================
// Types
// ============================================

export interface ExecuteWorkflowOptions {
  /** The installed App with workflow steps */
  app: InstalledApp
  /** What triggered this workflow run */
  trigger: TriggerContext
  /** Workflow store for recording execution data */
  workflowStore: WorkflowStore
  /** Memory service used to load the memory snapshot at workflow start */
  memory: MemoryService
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal
  /** Dependencies for LLM call nodes */
  llmDeps: LlmCallDeps
  /** Dependencies for tool call nodes */
  toolDeps: ToolCallDeps
}

// ============================================
// Helpers
// ============================================

function assertAutomationSpec(
  app: InstalledApp,
): asserts app is InstalledApp & { spec: { steps: WorkflowStep[] } } {
  if (app.spec.type !== 'automation') {
    throw new RunExecutionError(
      app.id,
      'unknown',
      `executeWorkflow called for non-automation app type: ${app.spec.type}`,
    )
  }
  if (!app.spec.steps || app.spec.steps.length === 0) {
    throw new RunExecutionError(
      app.id,
      'unknown',
      'Workflow has no steps defined',
    )
  }
}

/**
 * Build a step ID → index map for O(1) lookups.
 */
function buildIndexMap(steps: WorkflowStep[]): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < steps.length; i++) {
    map.set(steps[i].id, i)
  }
  return map
}

/**
 * Convert a MemorySnapshot into the flat record shape used by WorkflowContext.
 *
 * Workflow variables (${memory.field}) resolve against this object. We expose
 * the most useful structural fields (line count, headers, archive info) rather
 * than the full file content, mirroring the metadata available to the
 * memory_status MCP tool.
 */
function snapshotToContext(s: MemorySnapshot): Record<string, unknown> {
  return {
    exists: s.exists,
    totalLines: s.totalLines,
    sizeBytes: s.sizeBytes,
    headers: s.headers.map(h => h.heading),
    archiveTotalCount: s.archiveTotalCount,
    lastModified: s.lastModified,
    fullContent: s.fullContent,
  }
}

/**
 * Determine the next step index after executing a step.
 *
 * For condition nodes: use the goto/default result.
 * For linear nodes (llm_call, tool_call): advance to the next unexecuted step
 * in the array that hasn't been visited.
 */
function getNextStepIndex(
  stepType: string,
  currentIndex: number,
  steps: WorkflowStep[],
  nodeRuns: Set<string>,
  conditionNextId?: string,
  indexMap?: Map<string, number>,
): number | null {
  // Condition with no valid target → stop (no match, no default, or invalid reference)
  if (stepType === 'condition') {
    if (conditionNextId && indexMap) {
      const nextIdx = indexMap.get(conditionNextId)
      if (nextIdx !== undefined) {
        return nextIdx
      }
    }
    return null
  }

  // Linear nodes: find the next unvisited step in forward order
  for (let i = currentIndex + 1; i < steps.length; i++) {
    if (!nodeRuns.has(steps[i].id)) {
      return i
    }
  }
  return null
}

/**
 * Check if all entries in an array are unique by their `id` field.
 */
function validateUniqueIds(steps: WorkflowStep[]): void {
  const seen = new Set<string>()
  for (const step of steps) {
    if (seen.has(step.id)) {
      throw new RunExecutionError(
        'unknown', 'unknown',
        `Duplicate step id in workflow: "${step.id}"`,
      )
    }
    seen.add(step.id)
  }
}

/**
 * Validate that condition goto/default references point to valid step ids
 * that appear later in the steps array.
 */
function validateGotoReferences(steps: WorkflowStep[], indexMap: Map<string, number>): void {
  for (const step of steps) {
    if (step.type === 'condition') {
      const cond = step as ConditionStep
      for (const c of cond.cases) {
        const targetIdx = indexMap.get(c.goto)
        if (targetIdx === undefined) {
          throw new RunExecutionError(
            'unknown', 'unknown',
            `Condition "${step.id}" references unknown step: "${c.goto}"`,
          )
        }
      }
      if (cond.default) {
        const targetIdx = indexMap.get(cond.default)
        if (targetIdx === undefined) {
          throw new RunExecutionError(
            'unknown', 'unknown',
            `Condition "${step.id}" default references unknown step: "${cond.default}"`,
          )
        }
      }
    }
  }
}

// ============================================
// DAG Execution
// ============================================

/**
 * Execute a workflow DAG.
 *
 * Lifecycle:
 * 1. Validate the workflow definition
 * 2. Create a workflow run record
 * 3. Execute steps in order:
 *    - Linear nodes (llm_call, tool_call) execute in array order
 *    - Condition nodes redirect to goto/default targets
 * 4. Record each node execution to the workflow store
 * 5. Finalize the workflow run record
 *
 * @returns AppRunResult compatible with the existing runtime
 */
export async function executeWorkflow(
  options: ExecuteWorkflowOptions,
): Promise<AppRunResult> {
  const { app, trigger, workflowStore, memory, abortSignal, llmDeps, toolDeps } = options

  // Validate
  assertAutomationSpec(app)
  const steps = app.spec.steps!

  // Validate DAG structure
  validateUniqueIds(steps)
  const indexMap = buildIndexMap(steps)
  validateGotoReferences(steps, indexMap)

  const appId = app.id
  const startedAt = Date.now()
  const runTag = `wf-${startedAt.toString(36)}`

  console.log(`[Workflow][${runTag}] ▶ Starting workflow: app=${appId}, steps=${steps.length}, trigger=${trigger.type}`)

  // Create workflow run record
  const runId = workflowStore.createWorkflowRun({
    appId,
    triggerType: trigger.type,
    triggerData: trigger.eventPayload ?? undefined,
    flowDefinitionJson: JSON.stringify(steps),
  })

  // Load memory snapshot so ${memory.field} references resolve against the
  // app's current memory.md state. Without this, context.memory stays {} and
  // any node referencing memory fields throws VariableResolutionError.
  const memoryScope: MemoryCallerScope = {
    type: 'app',
    spaceId: app.spaceId!,
    spacePath: getSpace(app.spaceId!)?.path ?? '',
    appId: app.id,
  }
  let memoryContext: Record<string, unknown> = {}
  try {
    const snapshot = await buildMemorySnapshot(memoryScope)
    memoryContext = snapshotToContext(snapshot)
    console.log(
      `[Workflow][${runTag}] Memory snapshot: exists=${snapshot.exists}, ` +
      `lines=${snapshot.totalLines}, headers=${snapshot.headers.length}`
    )
  } catch (err) {
    console.warn(`[Workflow][${runTag}] Failed to load memory snapshot:`, err)
  }

  // Initialize workflow context
  const context: WorkflowContext = {
    trigger: trigger.eventPayload ?? ({} as Record<string, unknown>),
    memory: memoryContext,
    steps: {},
  }

  // Track execution
  const visited = new Set<string>()
  let currentIndex = 0
  let finalStatus: UpdateWorkflowRunInput = {
    status: 'completed',
    finishedAt: 0,
    durationMs: 0,
  }

  try {
    while (currentIndex < steps.length && !abortSignal?.aborted) {
      const step = steps[currentIndex]

      // Skip already visited nodes (shouldn't happen in forward-only DAG)
      if (visited.has(step.id)) {
        currentIndex++
        continue
      }

      visited.add(step.id)
      const stepRunId = workflowStore.createNodeRun({
        runId,
        appId,
        stepId: step.id,
        stepType: step.type,
      })

      console.log(`[Workflow][${runTag}] ▶ Node: ${step.id} (${step.type})`)

      let nodeStatus: NodeRunStatus = 'completed'
      let nodeError: string | undefined
      let nodeOutput: Record<string, unknown> = {}
      let conditionNextId: string | undefined

      const nodeStartedAt = Date.now()

      try {
        switch (step.type) {
          case 'llm_call': {
            const result = await executeLlmCallNode(step as LlmCallStep, context, llmDeps)
            nodeStatus = result.status
            nodeOutput = result.output
            if (result.status === 'error') {
              nodeError = result.error
            }
            // Store output in context for downstream steps
            context.steps[step.id] = result.output
            break
          }

          case 'tool_call': {
            const result = await executeToolCallNode(step as ToolCallStep, context, toolDeps)
            nodeStatus = result.status
            nodeOutput = result.output
            if (result.status === 'error') {
              nodeError = result.error
            }
            context.steps[step.id] = result.output
            break
          }

          case 'condition': {
            const result = await executeConditionNode(step as ConditionStep, context)
            nodeStatus = result.status
            nodeOutput = result.output
            conditionNextId = result.nextNodeId
            // Store condition result in context
            context.steps[step.id] = result.output
            break
          }

          default:
            nodeStatus = 'error'
            nodeError = `Unknown step type: ${(step as WorkflowStep).type}`
        }
      } catch (err) {
        nodeStatus = 'error'
        nodeError = err instanceof Error ? err.message : String(err)
        console.log(`[Workflow][${runTag}] ✗ Node ${step.id} failed:`, nodeError)
      }

      const nodeFinishedAt = Date.now()
      workflowStore.updateNodeRun(stepRunId, {
        status: nodeStatus,
        output: nodeOutput,
        error: nodeError,
        finishedAt: nodeFinishedAt,
        durationMs: nodeFinishedAt - nodeStartedAt,
      })

      // If node failed, stop the workflow
      if (nodeStatus === 'error') {
        finalStatus = {
          status: 'error',
          finishedAt: Date.now(),
          durationMs: Date.now() - startedAt,
          errorMessage: nodeError,
        }
        break
      }

      // Determine next step
      const nextIndex = getNextStepIndex(
        step.type,
        currentIndex,
        steps,
        visited,
        conditionNextId,
        indexMap,
      )

      if (nextIndex === null) {
        break // No more steps to execute
      }

      currentIndex = nextIndex
    }

    // Finalize the run
    finalStatus = {
      ...finalStatus,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
    }
  } catch (err) {
    const finishedAt = Date.now()
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[Workflow][${runTag}] ✗ Workflow failed:`, err)

    finalStatus = {
      status: 'error',
      finishedAt,
      durationMs: finishedAt - startedAt,
      errorMessage,
    }
  }

  // Save final status
  workflowStore.updateWorkflowRun(runId, finalStatus)

  const statusLabel = finalStatus.status === 'completed' ? '✓' : '✗'
  console.log(
    `[Workflow][${runTag}] ${statusLabel} Workflow ${finalStatus.status}: ` +
    `runId=${runId}, nodes=${visited.size}, duration=${finalStatus.durationMs}ms` +
    (finalStatus.errorMessage ? `, error=${finalStatus.errorMessage}` : ''),
  )

  return {
    appId,
    runId,
    sessionKey: `wf-${runId.slice(0, 8)}`,
    outcome: finalStatus.status === 'completed' ? 'useful' : 'error',
    startedAt,
    finishedAt: finalStatus.finishedAt,
    durationMs: finalStatus.durationMs,
    errorMessage: finalStatus.errorMessage,
  }
}