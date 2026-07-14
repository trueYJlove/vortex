/**
 * apps/runtime/workflow -- Variable Resolution
 *
 * Resolves `${...}` template references against the workflow context.
 *
 * Resolution rules:
 *   - ${node_id.field}      → context.steps[node_id][field]
 *   - ${memory.field}        → context.memory[field]
 *   - ${trigger.field}       → context.trigger[field]
 *   - Unresolvable reference → throws VariableResolutionError
 */

import { VariableResolutionError, type WorkflowContext } from './types'

// Matches ${...} references. Non-greedy inner match to handle nested braces.
const VARIABLE_REF_REGEX = /\$\{([^}]+)\}/g

/**
 * Resolve a single variable reference against the context.
 *
 * Reference format: <namespace>.<path>
 *   - namespace: 'memory' | 'trigger' | a step/node id
 *   - path: dot-separated field path into the namespace object
 */
function resolveReference(ref: string, context: WorkflowContext): unknown {
  const dotIndex = ref.indexOf('.')
  if (dotIndex === -1) {
    throw new VariableResolutionError(ref)
  }

  const namespace = ref.slice(0, dotIndex)
  const fieldPath = ref.slice(dotIndex + 1)
  const parts = fieldPath.split('.')

  let value: unknown

  if (namespace === 'memory') {
    value = context.memory
  } else if (namespace === 'trigger') {
    value = context.trigger
  } else {
    // Treat as a step/node id reference
    value = context.steps[namespace]
  }

  if (value === undefined || value === null) {
    throw new VariableResolutionError(ref)
  }

  // Navigate the field path
  for (const part of parts) {
    if (typeof value !== 'object' || value === null) {
      throw new VariableResolutionError(ref)
    }
    value = (value as Record<string, unknown>)[part]
    if (value === undefined) {
      throw new VariableResolutionError(ref)
    }
  }

  return value
}

/**
 * Resolve all `${...}` variable references in a text string
 * against the workflow context.
 *
 * @param text   - The template string containing optional ${...} references
 * @param context - The workflow context to resolve against
 * @returns The resolved string with all references replaced by their values
 * @throws VariableResolutionError if any reference cannot be resolved
 */
export function resolveVariables(
  text: string,
  context: WorkflowContext
): string {
  if (!text.includes('${')) {
    return text
  }

  return text.replace(VARIABLE_REF_REGEX, (match, ref) => {
    const value = resolveReference(ref.trim(), context)
    return String(value)
  })
}

/**
 * Recursively resolve all string values in an object.
 * Non-string values are left unchanged.
 *
 * @param obj     - The object whose string values should be resolved
 * @param context - The workflow context to resolve against
 * @returns A new object with all string values resolved
 */
export function resolveObject(
  obj: Record<string, unknown>,
  context: WorkflowContext
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = resolveVariables(value, context)
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = resolveObject(value as Record<string, unknown>, context)
    } else {
      result[key] = value
    }
  }

  return result
}