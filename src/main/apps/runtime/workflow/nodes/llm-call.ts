/**
 * apps/runtime/workflow/nodes -- LLM Call Node Executor
 *
 * Executes an llm_call step: creates an SDK session with filtered MCP tools,
 * sends the resolved prompt, and extracts structured output.
 */

import type { LlmCallStep } from '../../../spec/schema'
import type { WorkflowContext, NodeRunResult } from '../types'
import { resolveVariables } from '../context'

// ============================================
// Types
// ============================================

export interface SdkSession {
  send(message: string): AsyncIterable<unknown>
  close(): Promise<void>
}

export interface LlmCallDeps {
  createSession: (options: Record<string, unknown>) => Promise<SdkSession>
  systemPrompt: string
  /** MCP servers to register (pre-filtered by step.tools) */
  mcpServers: Record<string, unknown>
  maxTurns?: number
}

// ============================================
// Executor
// ============================================

/**
 * Execute an llm_call node.
 *
 * 1. Resolve variables in step.prompt
 * 2. Create SDK session with filtered MCP tools
 * 3. Send resolved prompt, process stream
 * 4. Extract llm_result from final text
 * 5. Parse step.output mapping → structured output
 * 6. Close session
 */
export async function executeLlmCallNode(
  step: LlmCallStep,
  context: WorkflowContext,
  deps: LlmCallDeps,
): Promise<NodeRunResult> {
  const resolvedPrompt = resolveVariables(step.prompt, context)

  const sdkOptions: Record<string, unknown> = {
    systemPrompt: deps.systemPrompt,
    mcpServers: deps.mcpServers,
    maxTurns: deps.maxTurns ?? 10,
  }

  const session = await deps.createSession(sdkOptions)
  let finalText = ''

  try {
    const iterable = session.send(resolvedPrompt)
    for await (const chunk of iterable) {
      // Collect text from stream chunks
      if (chunk && typeof chunk === 'object' && 'type' in (chunk as any)) {
        const c = chunk as { type: string; text?: string; content?: string }
        if (c.type === 'text' && c.text) {
          finalText += c.text
        } else if (c.type === 'content_block_delta' && c.content) {
          finalText += c.content
        }
      }
    }
  } finally {
    await session.close().catch(() => {})
  }

  // Build output map
  const output: Record<string, unknown> = {}
  output.llm_result = finalText

  if (step.output) {
    // Try to parse response as JSON for structured extraction
    let parsedJson: Record<string, unknown> | null = null
    try {
      const jsonMatch = finalText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsedJson = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      }
    } catch {
      // Non-JSON response — fields will fall back to the full text
    }

    for (const [fieldKey, fieldPath] of Object.entries(step.output)) {
      // Try to extract from JSON response
      if (parsedJson) {
        const value = parsedJson[fieldPath] ?? parsedJson[fieldKey]
        if (value !== undefined) {
          output[fieldKey] = value
          continue
        }
      }

      // Fallback: use the field path as a key into the JSON, or the full text
      output[fieldKey] = parsedJson?.[fieldPath] ?? finalText
    }
  }

  return {
    nodeId: step.id,
    status: 'completed',
    output,
  }
}