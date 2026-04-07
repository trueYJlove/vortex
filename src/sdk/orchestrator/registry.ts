/**
 * @module orchestrator/registry
 * Agent registry — tracks running, completed, and failed sub-agents.
 * Used by the spawner for background agent polling and lifecycle management.
 * @license MIT
 */

import type { SDKMessage } from '../core/query-loop.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentStatus = 'running' | 'completed' | 'failed' | 'stopped';

export interface AgentEntry {
  /** Unique agent ID. */
  id: string;
  /** Human-readable description from the spawn request. */
  description: string;
  /** Current status. */
  status: AgentStatus;
  /** AbortController for cancellation. */
  abortController: AbortController;
  /** Final text result (set on completion). */
  result?: string;
  /** Error message (set on failure). */
  error?: string;
  /** Collected SDKMessage events. */
  messages: SDKMessage[];
  /** Timestamp (ms) when the agent was spawned. */
  startedAt: number;
  /** Timestamp (ms) when the agent completed/failed. */
  endedAt?: number;
  /** Promise that resolves when the agent finishes. */
  done: Promise<void>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * In-memory agent registry.
 * One registry per session — scoped to the parent agent's lifetime.
 */
export class AgentRegistry {
  private readonly agents = new Map<string, AgentEntry>();

  /** Register a new agent. */
  register(entry: AgentEntry): void {
    this.agents.set(entry.id, entry);
  }

  /** Look up an agent by ID. */
  get(id: string): AgentEntry | undefined {
    return this.agents.get(id);
  }

  /** Look up an agent by name (description). Returns the first match. */
  findByName(name: string): AgentEntry | undefined {
    for (const entry of this.agents.values()) {
      if (entry.description === name) return entry;
    }
    return undefined;
  }

  /** List all agents. */
  list(): AgentEntry[] {
    return [...this.agents.values()];
  }

  /** Stop a running agent. */
  stop(id: string): boolean {
    const entry = this.agents.get(id);
    if (!entry || entry.status !== 'running') return false;
    entry.abortController.abort();
    entry.status = 'stopped';
    entry.endedAt = Date.now();
    return true;
  }

  /** Mark an agent as completed. */
  complete(id: string, result: string): void {
    const entry = this.agents.get(id);
    if (!entry) return;
    entry.status = 'completed';
    entry.result = result;
    entry.endedAt = Date.now();
  }

  /** Mark an agent as failed. */
  fail(id: string, error: string): void {
    const entry = this.agents.get(id);
    if (!entry) return;
    entry.status = 'failed';
    entry.error = error;
    entry.endedAt = Date.now();
  }

  /** Clean up all agents (abort running, clear registry). */
  dispose(): void {
    for (const entry of this.agents.values()) {
      if (entry.status === 'running') {
        entry.abortController.abort();
        entry.status = 'stopped';
        entry.endedAt = Date.now();
      }
    }
    this.agents.clear();
  }
}
