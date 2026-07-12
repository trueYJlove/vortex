/**
 * apps/runtime/workflow -- Workflow Store
 *
 * SQLite CRUD operations for workflow_runs and workflow_node_runs.
 * All methods are synchronous (better-sqlite3 is synchronous).
 * Follows the same pattern as the ActivityStore in ../store.ts.
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

// ============================================
// Types
// ============================================

export type WorkflowRunStatus = 'running' | 'completed' | 'error'

export interface WorkflowRun {
  runId: string
  appId: string
  status: WorkflowRunStatus
  triggerType: string
  triggerData?: Record<string, unknown>
  flowDefinitionJson: string
  startedAt: number
  finishedAt?: number
  durationMs?: number
  errorMessage?: string
}

export type NodeRunStatus = 'pending' | 'running' | 'completed' | 'error' | 'skipped'

export interface WorkflowNodeRun {
  id: string
  runId: string
  appId: string
  stepId: string
  stepType: string
  status: NodeRunStatus
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  startedAt: number
  finishedAt?: number
  durationMs?: number
}

export interface CreateWorkflowRunInput {
  appId: string
  triggerType: string
  triggerData?: Record<string, unknown>
  flowDefinitionJson: string
}

export interface UpdateWorkflowRunInput {
  status: WorkflowRunStatus
  finishedAt: number
  durationMs: number
  errorMessage?: string
}

export interface CreateNodeRunInput {
  runId: string
  appId: string
  stepId: string
  stepType: string
  input?: Record<string, unknown>
}

export interface UpdateNodeRunInput {
  status: NodeRunStatus
  output?: Record<string, unknown>
  error?: string
  finishedAt: number
  durationMs: number
}

// ============================================
// Internal Row Types
// ============================================

interface WorkflowRunRow {
  run_id: string
  app_id: string
  status: string
  trigger_type: string
  trigger_data_json: string | null
  flow_definition_json: string
  started_at: number
  finished_at: number | null
  duration_ms: number | null
  error_message: string | null
}

interface WorkflowNodeRunRow {
  id: string
  run_id: string
  app_id: string
  step_id: string
  step_type: string
  status: string
  input_json: string | null
  output_json: string | null
  started_at: number
  finished_at: number | null
  duration_ms: number | null
}

// ============================================
// Row <-> Domain Conversions
// ============================================

function rowToWorkflowRun(row: WorkflowRunRow): WorkflowRun {
  return {
    runId: row.run_id,
    appId: row.app_id,
    status: row.status as WorkflowRunStatus,
    triggerType: row.trigger_type,
    triggerData: row.trigger_data_json ? JSON.parse(row.trigger_data_json) : undefined,
    flowDefinitionJson: row.flow_definition_json,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    errorMessage: row.error_message ?? undefined,
  }
}

function rowToNodeRun(row: WorkflowNodeRunRow): WorkflowNodeRun {
  return {
    id: row.id,
    runId: row.run_id,
    appId: row.app_id,
    stepId: row.step_id,
    stepType: row.step_type,
    status: row.status as NodeRunStatus,
    input: row.input_json ? JSON.parse(row.input_json) : undefined,
    output: row.output_json ? JSON.parse(row.output_json) : undefined,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
  }
}

// ============================================
// Workflow Store
// ============================================

/**
 * SQLite store for workflow runs and node-level execution records.
 *
 * Uses prepared statements for performance.
 * All methods are synchronous (better-sqlite3).
 */
export class WorkflowStore {
  private readonly db: Database.Database

  // Prepared statements
  private readonly stmtInsertRun: Database.Statement
  private readonly stmtGetRun: Database.Statement
  private readonly stmtUpdateRun: Database.Statement
  private readonly stmtInsertNodeRun: Database.Statement
  private readonly stmtGetNodeRun: Database.Statement
  private readonly stmtUpdateNodeRun: Database.Statement
  private readonly stmtGetNodeRunsForRun: Database.Statement
  private readonly stmtGetRunningRunForApp: Database.Statement
  private readonly stmtGetRunsForApp: Database.Statement

  constructor(db: Database.Database) {
    this.db = db

    this.stmtInsertRun = db.prepare(`
      INSERT INTO workflow_runs
        (run_id, app_id, status, trigger_type, trigger_data_json, flow_definition_json, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    this.stmtGetRun = db.prepare(`
      SELECT * FROM workflow_runs WHERE run_id = ?
    `)

    this.stmtUpdateRun = db.prepare(`
      UPDATE workflow_runs
      SET status = ?, finished_at = ?, duration_ms = ?, error_message = ?
      WHERE run_id = ?
    `)

    this.stmtInsertNodeRun = db.prepare(`
      INSERT INTO workflow_node_runs
        (id, run_id, app_id, step_id, step_type, status, input_json, output_json, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.stmtGetNodeRun = db.prepare(`
      SELECT * FROM workflow_node_runs WHERE id = ?
    `)

    this.stmtUpdateNodeRun = db.prepare(`
      UPDATE workflow_node_runs
      SET status = ?, output_json = ?, finished_at = ?, duration_ms = ?
      WHERE id = ?
    `)

    this.stmtGetNodeRunsForRun = db.prepare(`
      SELECT * FROM workflow_node_runs WHERE run_id = ? ORDER BY started_at ASC
    `)

    this.stmtGetRunningRunForApp = db.prepare(`
      SELECT * FROM workflow_runs WHERE app_id = ? AND status = 'running' LIMIT 1
    `)

    this.stmtGetRunsForApp = db.prepare(`
      SELECT * FROM workflow_runs WHERE app_id = ? ORDER BY started_at DESC LIMIT ?
    `)
  }

  // ── Run Operations ────────────────────────────

  createWorkflowRun(input: CreateWorkflowRunInput): string {
    const runId = randomUUID()
    const now = Date.now()
    this.stmtInsertRun.run(
      runId,
      input.appId,
      'running',
      input.triggerType,
      input.triggerData ? JSON.stringify(input.triggerData) : null,
      input.flowDefinitionJson,
      now,
    )
    return runId
  }

  getWorkflowRun(runId: string): WorkflowRun | null {
    const row = this.stmtGetRun.get(runId) as WorkflowRunRow | undefined
    return row ? rowToWorkflowRun(row) : null
  }

  updateWorkflowRun(runId: string, input: UpdateWorkflowRunInput): void {
    this.stmtUpdateRun.run(
      input.status,
      input.finishedAt,
      input.durationMs,
      input.errorMessage ?? null,
      runId,
    )
  }

  getRunningRunForApp(appId: string): WorkflowRun | null {
    const row = this.stmtGetRunningRunForApp.get(appId) as WorkflowRunRow | undefined
    return row ? rowToWorkflowRun(row) : null
  }

  getWorkflowRunsForApp(appId: string, limit: number = 20): WorkflowRun[] {
    const rows = this.stmtGetRunsForApp.all(appId, limit) as WorkflowRunRow[]
    return rows.map(rowToWorkflowRun)
  }

  // ── Node Run Operations ───────────────────────

  createNodeRun(input: CreateNodeRunInput): string {
    const id = `wnr-${randomUUID().slice(0, 12)}`
    const now = Date.now()
    this.stmtInsertNodeRun.run(
      id,
      input.runId,
      input.appId,
      input.stepId,
      input.stepType,
      'pending',
      input.input ? JSON.stringify(input.input) : null,
      null,
      now,
    )
    return id
  }

  updateNodeRun(nodeRunId: string, input: UpdateNodeRunInput): void {
    const outputJson = input.output
      ? JSON.stringify(input.output)
      : (input.status === 'error' ? JSON.stringify({ error: input.error }) : null)
    this.stmtUpdateNodeRun.run(
      input.status,
      outputJson,
      input.finishedAt,
      input.durationMs,
      nodeRunId,
    )
  }

  getNodeRun(nodeRunId: string): WorkflowNodeRun | null {
    const row = this.stmtGetNodeRun.get(nodeRunId) as WorkflowNodeRunRow | undefined
    return row ? rowToNodeRun(row) : null
  }

  getNodeRunsForRun(runId: string): WorkflowNodeRun[] {
    const rows = this.stmtGetNodeRunsForRun.all(runId) as WorkflowNodeRunRow[]
    return rows.map(rowToNodeRun)
  }
}