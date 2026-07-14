/**
 * apps/runtime/workflow/nodes -- Condition Node Executor
 *
 * Evaluates a condition step: resolves the input variable, iterates cases
 * in order, applies the first matching operator, and returns the target node.
 *
 * Supports operators: eq, neq, contains, matches, gt, lt, gte, lte
 */

import type { ConditionStep, ConditionCase } from '../../../spec/schema'
import type { WorkflowContext, NodeRunResult } from '../types'
import { resolveVariables } from '../context'

// ============================================
// Errors
// ============================================

export class NoMatchingCaseError extends Error {
  constructor(inputValue: unknown) {
    super(`No matching case for input: ${JSON.stringify(inputValue)}`)
    this.name = 'NoMatchingCaseError'
  }
}

// ============================================
// Operator evaluation
// ============================================

function evaluateOperator(
  operator: string,
  caseValue: unknown,
  inputValue: unknown,
): boolean {
  switch (operator) {
    case 'eq':
      return inputValue === caseValue

    case 'neq':
      return inputValue !== caseValue

    case 'contains': {
      if (typeof inputValue === 'string' && typeof caseValue === 'string') {
        return inputValue.includes(caseValue)
      }
      if (Array.isArray(inputValue)) {
        return inputValue.includes(caseValue)
      }
      return false
    }

    case 'matches':
      if (typeof inputValue === 'string' && typeof caseValue === 'string') {
        try {
          return new RegExp(caseValue).test(inputValue)
        } catch {
          return false
        }
      }
      return false

    case 'gt':
      return typeof inputValue === 'number' && typeof caseValue === 'number'
        ? inputValue > caseValue
        : Number(inputValue) > Number(caseValue)

    case 'lt':
      return typeof inputValue === 'number' && typeof caseValue === 'number'
        ? inputValue < caseValue
        : Number(inputValue) < Number(caseValue)

    case 'gte':
      return typeof inputValue === 'number' && typeof caseValue === 'number'
        ? inputValue >= caseValue
        : Number(inputValue) >= Number(caseValue)

    case 'lte':
      return typeof inputValue === 'number' && typeof caseValue === 'number'
        ? inputValue <= caseValue
        : Number(inputValue) <= Number(caseValue)

    default:
      return false
  }
}

// ============================================
// Case matching
// ============================================

/**
 * Find the first case whose condition matches the input value.
 * Returns the goto target of the matching case, or undefined if none match.
 */
function findMatchingCase(inputValue: unknown, cases: ConditionCase[]): string | undefined {
  for (const c of cases) {
    const when = c.when
    for (const [op, val] of Object.entries(when)) {
      if (evaluateOperator(op, val, inputValue)) {
        return c.goto
      }
    }
  }
  return undefined
}

// ============================================
// Executor
// ============================================

/**
 * Execute a condition node.
 *
 * 1. Resolve step.input variable
 * 2. Evaluate cases in order — first match wins
 * 3. If no match → use default
 * 4. If no default → throw NoMatchingCaseError
 * 5. Return NodeRunResult with nextNodeId
 */
export async function executeConditionNode(
  step: ConditionStep,
  context: WorkflowContext,
): Promise<NodeRunResult> {
  // Resolve input variable
  const resolvedInput = resolveVariables(step.input, context)

  // Evaluate cases
  const matchedGoto = findMatchingCase(resolvedInput, step.cases)
  const nextNodeId = matchedGoto ?? step.default

  if (!nextNodeId) {
    throw new NoMatchingCaseError(resolvedInput)
  }

  return {
    nodeId: step.id,
    status: 'completed',
    output: {
      input_value: resolvedInput,
      next_node: nextNodeId,
    },
    nextNodeId,
  }
}