/**
 * apps/spec Validation
 *
 * Wraps Zod schema parsing with Halo-specific error formatting.
 * Converts ZodError into AppSpecValidationError with structured issues.
 */

import { ZodError } from 'zod'
import { AppSpecSchema } from './schema'
import type { AppSpec, WorkflowStep, ConditionStep } from './schema'
import { AppSpecValidationError } from './errors'
import type { ValidationIssue } from './errors'

/**
 * Validate a parsed (and normalized) JS object against the AppSpec Zod schema.
 *
 * @param parsed - Raw JS object (output of normalizeRawSpec)
 * @returns Validated and typed AppSpec
 * @throws AppSpecValidationError with structured issues on failure
 */
export function validateAppSpec(parsed: unknown): AppSpec {
  try {
    return AppSpecSchema.parse(parsed)
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = formatZodIssues(err)
      const summary = buildErrorSummary(issues)
      throw new AppSpecValidationError(summary, issues)
    }
    // Unexpected error -- re-throw as-is
    throw err
  }
}

/**
 * Same as validateAppSpec but returns a result object instead of throwing.
 * Useful for UI contexts where you want to display all errors at once.
 */
export function validateAppSpecSafe(parsed: unknown):
  | { success: true; data: AppSpec }
  | { success: false; error: AppSpecValidationError } {
  try {
    const data = validateAppSpec(parsed)
    return { success: true, data }
  } catch (err) {
    if (err instanceof AppSpecValidationError) {
      return { success: false, error: err }
    }
    // Wrap unexpected errors
    return {
      success: false,
      error: new AppSpecValidationError(
        err instanceof Error ? err.message : String(err),
        [{ path: '', message: String(err) }]
      )
    }
  }
}

/**
 * Convert Zod issues into our ValidationIssue format.
 */
function formatZodIssues(zodError: ZodError): ValidationIssue[] {
  return zodError.issues.map((issue) => {
    const path = issue.path.map(String).join('.')
    let message = issue.message

    // Enrich message for common cases
    if (issue.code === 'invalid_type') {
      message = `Expected ${issue.expected}, received ${issue.received}`
    } else if (issue.code === 'invalid_enum_value') {
      message = `Invalid value. Expected one of: ${issue.options.join(', ')}`
    } else if (issue.code === 'invalid_union_discriminator') {
      message = `Invalid app type. Expected one of: ${issue.options.join(', ')}`
    }

    return {
      path,
      message,
      received: 'received' in issue ? (issue as unknown as Record<string, unknown>).received : undefined
    }
  })
}

/**
 * Build a human-readable error summary from validation issues.
 */
function buildErrorSummary(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return 'App spec validation failed'
  }

  if (issues.length === 1) {
    const issue = issues[0]
    const location = issue.path ? ` at "${issue.path}"` : ''
    return `App spec validation failed${location}: ${issue.message}`
  }

  const lines = issues.map((issue) => {
    const location = issue.path ? `  [${issue.path}]` : ''
    return `${location} ${issue.message}`
  })

  return `App spec validation failed with ${issues.length} issues:\n${lines.join('\n')}`
}

// ============================================================================
// Workflow DAG Validation
// ============================================================================

export interface WorkflowValidationIssue {
  path: string
  message: string
}

export interface WorkflowValidationResult {
  valid: boolean
  issues: WorkflowValidationIssue[]
}

/**
 * Validate a workflow step array for structural integrity:
 *  1. All goto/default references point to existing step ids.
 *  2. No cycles reachable from the entry node.
 *  3. At least one terminal node (no outgoing reference).
 *  4. condition nodes have at least one case or default.
 *  5. Duplicate node IDs.
 */
export function validateWorkflowSteps(steps: WorkflowStep[]): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = []

  if (steps.length === 0) {
    return { valid: true, issues: [] }
  }

  const nodeIds = new Set(steps.map(s => s.id))

  // 1. Check duplicate node IDs
  const seen = new Set<string>()
  for (const step of steps) {
    if (seen.has(step.id)) {
      issues.push({ path: 'steps', message: `Duplicate node id: "${step.id}"` })
    }
    seen.add(step.id)
  }

  // 2. Check all goto/default references exist
  for (const step of steps) {
    if (step.type === 'condition') {
      for (const c of step.cases) {
        if (!nodeIds.has(c.goto)) {
          issues.push({ path: `steps.${step.id}.cases`, message: `goto references non-existent node: "${c.goto}"` })
        }
      }
      if (step.default && !nodeIds.has(step.default)) {
        issues.push({ path: `steps.${step.id}`, message: `default references non-existent node: "${step.default}"` })
      }
    }
  }

  // 3. Find terminal nodes (nodes with no outgoing edges)
  const hasOutgoingEdge = new Set<string>()
  for (const step of steps) {
    if (step.type === 'condition') {
      for (const c of step.cases) {
        hasOutgoingEdge.add(c.goto)
      }
      if (step.default) {
        hasOutgoingEdge.add(step.default)
      }
    }
  }
  const terminalNodes = steps.filter(s => !hasOutgoingEdge.has(s.id))
  if (terminalNodes.length === 0) {
    issues.push({ path: 'steps', message: 'No terminal node found — at least one step must have no outgoing edges' })
  }

  // 4. Check condition nodes have cases or default
  for (const step of steps) {
    if (step.type === 'condition') {
      if (step.cases.length === 0 && !step.default) {
        issues.push({ path: `steps.${step.id}`, message: 'Condition node must have at least one case or a default' })
      }
    }
  }

  // 5. Cycle detection (DFS from first node)
  const adjacency = new Map<string, string[]>()
  for (const step of steps) {
    if (step.type === 'condition') {
      const targets = [...step.cases.map(c => c.goto)]
      if (step.default) targets.push(step.default)
      adjacency.set(step.id, targets)
    } else {
      adjacency.set(step.id, [])
    }
  }

  const visited = new Set<string>()
  const inStack = new Set<string>()

  function detectCycle(nodeId: string): boolean {
    if (inStack.has(nodeId)) return true
    if (visited.has(nodeId)) return false
    visited.add(nodeId)
    inStack.add(nodeId)
    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (detectCycle(neighbor)) return true
    }
    inStack.delete(nodeId)
    return false
  }

  if (steps.length > 0) {
    const entryNode = steps[0].id
    if (detectCycle(entryNode)) {
      issues.push({ path: 'steps', message: 'Cycle detected in workflow — no cycles allowed' })
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}
