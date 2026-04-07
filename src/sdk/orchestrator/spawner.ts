/**
 * @module orchestrator/spawner
 * AgentSpawner — runs sub-agent query loops in-process.
 *
 * Supports both foreground (blocking) and background (fire-and-forget) modes.
 * The parent's tool execution either awaits the child loop or returns immediately
 * with an agent ID for polling.
 *
 * @license MIT
 */

import { randomUUID } from 'node:crypto';
import type { LlmProvider, ContentBlock } from '../types/provider.js';
import type { Tool, ToolContext, ToolResult } from '../types/tool.js';
import { toolSuccess, toolError } from '../types/tool.js';
import type { Options, QueryConfig, AgentDefinition } from '../types/config.js';
import { resolveQueryConfig } from '../core/context.js';
import { queryLoop } from '../core/query-loop.js';
import type { SDKMessage } from '../core/query-loop.js';
import { filterTools } from '../tools/registry.js';
import type { AgentSpawnRequest } from '../tools/agent/index.js';
import { AgentRegistry } from './registry.js';

// ---------------------------------------------------------------------------
// Model alias resolution
// ---------------------------------------------------------------------------

const MODEL_ALIASES: Record<string, string> = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4',
  haiku: 'claude-haiku-3-5',
};

function resolveModel(model: string | undefined, parentModel: string): string {
  if (!model) return parentModel;
  return MODEL_ALIASES[model] ?? model;
}

// ---------------------------------------------------------------------------
// Extract final assistant text from SDKMessages
// ---------------------------------------------------------------------------

function extractFinalText(messages: SDKMessage[]): string {
  // Walk backwards to find the last assistant message with text
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === 'assistant') {
      const textBlocks = msg.message.content
        .filter((b: ContentBlock) => b.type === 'text')
        .map((b: ContentBlock) => (b as { type: 'text'; text: string }).text);
      if (textBlocks.length > 0) {
        return textBlocks.join('\n');
      }
    }
  }
  return '(Agent completed with no text output)';
}

// ---------------------------------------------------------------------------
// Build sub-agent tools
// ---------------------------------------------------------------------------

function buildSubAgentTools(
  parentTools: Tool[],
  request: AgentSpawnRequest,
): Tool[] {
  // Start with parent tools, excluding the Agent tool itself (prevent recursion)
  let tools = parentTools.filter((t) => t.name !== 'Agent');

  // If the request specifies allowed tools (from agent type or explicit), filter
  if (request.tools && request.tools.length > 0) {
    tools = filterTools(tools, { allowedTools: request.tools });
  }

  return tools;
}

// ---------------------------------------------------------------------------
// Build sub-agent system prompt
// ---------------------------------------------------------------------------

function buildSubAgentPrompt(request: AgentSpawnRequest, agentDef?: AgentDefinition): string {
  // Priority: explicit systemPrompt > agentDef.prompt > default
  if (request.systemPrompt) return request.systemPrompt;
  if (agentDef?.prompt) return agentDef.prompt;

  // Default sub-agent prompt
  const type = request.agentType?.name ?? 'general-purpose';
  return (
    `You are a sub-agent (type: ${type}) spawned to handle a specific task.\n\n` +
    `Task description: ${request.description}\n\n` +
    `Complete the task described in the user prompt. Be thorough but concise. ` +
    `When finished, provide your final answer as text.`
  );
}

// ---------------------------------------------------------------------------
// Run a sub-agent query loop
// ---------------------------------------------------------------------------

async function runSubAgent(
  request: AgentSpawnRequest,
  parentConfig: QueryConfig,
  provider: LlmProvider,
  parentTools: Tool[],
  agentAbortSignal: AbortSignal,
  parentAgents?: Record<string, AgentDefinition>,
): Promise<{ text: string; messages: SDKMessage[]; costUsd: number; turns: number }> {
  const model = resolveModel(request.model, parentConfig.model);
  const tools = buildSubAgentTools(parentTools, request);

  // Resolve agent definition from parent's agents config
  const agentDef = request.agentType?.name && parentAgents
    ? parentAgents[request.agentType.name]
    : undefined;

  const systemPrompt = buildSubAgentPrompt(request, agentDef);

  // Build sub-agent options
  const subOptions: Options = {
    model,
    maxTurns: request.maxTurns ?? agentDef?.maxTurns ?? parentConfig.maxTurns,
    maxBudgetUsd: parentConfig.maxBudgetUsd,
    cwd: parentConfig.cwd,
    env: parentConfig.env,
    systemPrompt,
    thinking: parentConfig.thinking,
    effort: parentConfig.effort,
    abortController: new AbortController(),
  };

  // Wire the parent abort signal to the child
  const subAbort = subOptions.abortController!;
  const onParentAbort = () => subAbort.abort();
  agentAbortSignal.addEventListener('abort', onParentAbort, { once: true });

  const subConfig = resolveQueryConfig(subOptions);
  const configWithSignal = { ...subConfig, abortSignal: subAbort.signal };

  const collected: SDKMessage[] = [];
  let costUsd = 0;
  let turns = 0;

  try {
    const gen = queryLoop(configWithSignal, provider, tools, request.prompt);

    for await (const msg of gen) {
      collected.push(msg);

      if (msg.type === 'result') {
        costUsd = msg.costUsd;
        turns = msg.turns;
      }
    }
  } finally {
    agentAbortSignal.removeEventListener('abort', onParentAbort);
  }

  const text = extractFinalText(collected);
  return { text, messages: collected, costUsd, turns };
}

// ---------------------------------------------------------------------------
// createSpawner — factory that returns the AgentSpawner function
// ---------------------------------------------------------------------------

export interface SpawnerDeps {
  provider: LlmProvider;
  parentConfig: QueryConfig;
  parentTools: Tool[];
  registry: AgentRegistry;
}

/**
 * Create an AgentSpawner function that can be registered via `setSpawner()`.
 *
 * The spawner supports:
 * - Foreground (synchronous): parent tool awaits child completion
 * - Background: returns immediately with agent_id, child runs in background
 */
export function createSpawner(deps: SpawnerDeps) {
  const { provider, parentConfig, parentTools, registry } = deps;

  return async function spawnAgent(
    request: AgentSpawnRequest,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const agentId = `agent-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const agentAbortController = new AbortController();

    // Create a deferred promise for the registry entry
    let resolveDone!: () => void;
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    // Register the agent
    registry.register({
      id: agentId,
      description: request.description,
      status: 'running',
      abortController: agentAbortController,
      messages: [],
      startedAt: Date.now(),
      done: donePromise,
    });

    // Wire parent abort signal
    if (ctx.abortSignal) {
      ctx.abortSignal.addEventListener('abort', () => {
        agentAbortController.abort();
      }, { once: true });
    }

    const runAgent = async () => {
      try {
        const result = await runSubAgent(
          request,
          parentConfig,
          provider,
          parentTools,
          agentAbortController.signal,
          parentConfig.agents,
        );

        const entry = registry.get(agentId);
        if (entry) {
          entry.messages = result.messages;
        }
        registry.complete(agentId, result.text);

        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        registry.fail(agentId, msg);
        throw err;
      } finally {
        resolveDone();
      }
    };

    // Background mode
    if (request.runInBackground) {
      // Fire and forget — don't await
      runAgent().catch(() => {
        // Error already recorded in registry
      });

      return toolSuccess(
        JSON.stringify({
          agent_id: agentId,
          status: 'running',
          description: request.description,
          message:
            `Agent '${request.description}' started in background (id: ${agentId}). ` +
            `Use TaskOutput tool with task_id '${agentId}' to check status.`,
        }),
      );
    }

    // Foreground mode — await completion
    try {
      const result = await runAgent();

      return toolSuccess(result.text);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return toolError(`Agent '${request.description}' failed: ${msg}`);
    }
  };
}
