/**
 * Unit Tests: apps/runtime/workflow — WorkflowStore
 *
 * Covers: CRUD for workflow_runs and workflow_node_runs,
 * FK constraints, relationships, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createDatabaseManager } from '../../../../../src/main/platform/store/database-manager'
import type { DatabaseManager } from '../../../../../src/main/platform/store/types'
import { WorkflowStore } from '../../../../../src/main/apps/runtime/workflow/store'
import {
  MIGRATION_NAMESPACE as MANAGER_MIGRATION_NS,
  migrations as managerMigrations,
} from '../../../../../src/main/apps/manager/migrations'
import {
  WORKFLOW_MIGRATION_NAMESPACE,
  workflowMigrations,
} from '../../../../../src/main/apps/runtime/workflow/migrations'

// ============================================
// Helpers
// ============================================

function createTestApp(db: any, appId: string): void {
  const specJson = JSON.stringify({
    spec_version: '1',
    name: 'test-app',
    version: '1.0.0',
    author: 'Test',
    description: 'A test automation app',
    type: 'automation',
    system_prompt: 'Test',
    subscriptions: [],
  })
  db.prepare(`
    INSERT INTO installed_apps (id, spec_id, space_id, spec_json, status, user_config_json, user_overrides_json, permissions_json, installed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(appId, 'test-app', 'space-001', specJson, 'active', '{}', '{}', '{"granted":[],"denied":[]}', Date.now())
}

// ============================================
// Migrations Tests
// ============================================

describe('Workflow Migrations', () => {
  let dbManager: DatabaseManager

  beforeEach(() => {
    dbManager = createDatabaseManager(':memory:')
  })

  it('should create workflow_runs and workflow_node_runs tables', () => {
    const db = dbManager.getAppDatabase()
    dbManager.runMigrations(db, MANAGER_MIGRATION_NS, managerMigrations)
    dbManager.runMigrations(db, WORKFLOW_MIGRATION_NAMESPACE, workflowMigrations)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>
    const tableNames = tables.map((t) => t.name)

    expect(tableNames).toContain('workflow_runs')
    expect(tableNames).toContain('workflow_node_runs')
  })

  it('should create indexes on workflow tables', () => {
    const db = dbManager.getAppDatabase()
    dbManager.runMigrations(db, MANAGER_MIGRATION_NS, managerMigrations)
    dbManager.runMigrations(db, WORKFLOW_MIGRATION_NAMESPACE, workflowMigrations)

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all() as Array<{ name: string }>
    const indexNames = indexes.map((i) => i.name)

    expect(indexNames).toContain('idx_workflow_runs_app')
    expect(indexNames).toContain('idx_workflow_node_runs_run')
  })

  it('should be idempotent (run twice without error)', () => {
    const db = dbManager.getAppDatabase()
    dbManager.runMigrations(db, MANAGER_MIGRATION_NS, managerMigrations)
    dbManager.runMigrations(db, WORKFLOW_MIGRATION_NAMESPACE, workflowMigrations)
    // Running again should not throw
    dbManager.runMigrations(db, WORKFLOW_MIGRATION_NAMESPACE, workflowMigrations)
  })
})

// ============================================
// WorkflowRun CRUD
// ============================================

describe('WorkflowStore — WorkflowRun CRUD', () => {
  let dbManager: DatabaseManager
  let store: WorkflowStore
  let testAppId: string

  beforeEach(() => {
    dbManager = createDatabaseManager(':memory:')
    const db = dbManager.getAppDatabase()
    dbManager.runMigrations(db, MANAGER_MIGRATION_NS, managerMigrations)
    dbManager.runMigrations(db, WORKFLOW_MIGRATION_NAMESPACE, workflowMigrations)
    store = new WorkflowStore(db)
    testAppId = 'app-' + Math.random().toString(36).slice(2, 8)
    createTestApp(db, testAppId)
  })

  it('should create a workflow run and return its ID', () => {
    const runId = store.createWorkflowRun({
      appId: testAppId,
      triggerType: 'schedule',
      flowDefinitionJson: JSON.stringify([{ id: 's1', type: 'llm_call' }]),
    })

    expect(runId).toBeTruthy()
    expect(typeof runId).toBe('string')
    expect(runId.length).toBeGreaterThan(0)
  })

  it('should retrieve a workflow run by ID', () => {
    const runId = store.createWorkflowRun({
      appId: testAppId,
      triggerType: 'manual',
      flowDefinitionJson: '[]',
    })

    const run = store.getWorkflowRun(runId)
    expect(run).not.toBeNull()
    expect(run!.runId).toBe(runId)
    expect(run!.appId).toBe(testAppId)
    expect(run!.triggerType).toBe('manual')
    expect(run!.status).toBe('running')
    expect(run!.startedAt).toBeGreaterThan(0)
  })

  it('should return null for non-existent run', () => {
    expect(store.getWorkflowRun('nonexistent')).toBeNull()
  })

  it('should create a run with trigger data', () => {
    const runId = store.createWorkflowRun({
      appId: testAppId,
      triggerType: 'webhook',
      triggerData: { event: 'push', ref: 'main' },
      flowDefinitionJson: '[]',
    })

    const run = store.getWorkflowRun(runId)
    expect(run!.triggerData).toEqual({ event: 'push', ref: 'main' })
  })

  it('should update a workflow run status and timing', () => {
    const runId = store.createWorkflowRun({
      appId: testAppId,
      triggerType: 'schedule',
      flowDefinitionJson: '[]',
    })

    const finishedAt = Date.now()
    const durationMs = 5000
    store.updateWorkflowRun(runId, {
      status: 'completed',
      finishedAt,
      durationMs,
    })

    const run = store.getWorkflowRun(runId)
    expect(run!.status).toBe('completed')
    expect(run!.finishedAt).toBe(finishedAt)
    expect(run!.durationMs).toBe(durationMs)
  })

  it('should update a workflow run with error message', () => {
    const runId = store.createWorkflowRun({
      appId: testAppId,
      triggerType: 'manual',
      flowDefinitionJson: '[]',
    })

    store.updateWorkflowRun(runId, {
      status: 'error',
      finishedAt: Date.now(),
      durationMs: 1000,
      errorMessage: 'Step failed',
    })

    const run = store.getWorkflowRun(runId)
    expect(run!.status).toBe('error')
    expect(run!.errorMessage).toBe('Step failed')
  })

  it('should get running run for app', () => {
    const runId = store.createWorkflowRun({
      appId: testAppId,
      triggerType: 'manual',
      flowDefinitionJson: '[]',
    })

    const running = store.getRunningRunForApp(testAppId)
    expect(running).not.toBeNull()
    expect(running!.runId).toBe(runId)
    expect(running!.status).toBe('running')
  })

  it('should return null when no running run exists', () => {
    const runId = store.createWorkflowRun({
      appId: testAppId,
      triggerType: 'manual',
      flowDefinitionJson: '[]',
    })
    store.updateWorkflowRun(runId, {
      status: 'completed',
      finishedAt: Date.now(),
      durationMs: 100,
    })

    expect(store.getRunningRunForApp(testAppId)).toBeNull()
  })

  it('should store flow definition JSON', () => {
    const steps = [
      { id: 's1', type: 'llm_call', prompt: 'Hello' },
      { id: 's2', type: 'tool_call', tool: 'my_tool', params: {} },
    ]
    const flowJson = JSON.stringify(steps)
    const runId = store.createWorkflowRun({
      appId: testAppId,
      triggerType: 'manual',
      flowDefinitionJson: flowJson,
    })

    const run = store.getWorkflowRun(runId)
    expect(run!.flowDefinitionJson).toBe(flowJson)
  })
})

// ============================================
// WorkflowNodeRun CRUD
// ============================================

describe('WorkflowStore — WorkflowNodeRun CRUD', () => {
  let dbManager: DatabaseManager
  let store: WorkflowStore
  let testAppId: string
  let runId: string

  beforeEach(() => {
    dbManager = createDatabaseManager(':memory:')
    const db = dbManager.getAppDatabase()
    dbManager.runMigrations(db, MANAGER_MIGRATION_NS, managerMigrations)
    dbManager.runMigrations(db, WORKFLOW_MIGRATION_NAMESPACE, workflowMigrations)
    store = new WorkflowStore(db)
    testAppId = 'app-' + Math.random().toString(36).slice(2, 8)
    createTestApp(db, testAppId)

    runId = store.createWorkflowRun({
      appId: testAppId,
      triggerType: 'manual',
      flowDefinitionJson: '[]',
    })
  })

  it('should create a node run and return its ID', () => {
    const nodeRunId = store.createNodeRun({
      runId,
      appId: testAppId,
      stepId: 'step_1',
      stepType: 'llm_call',
    })

    expect(nodeRunId).toBeTruthy()
    expect(nodeRunId).toContain('wnr-')
  })

  it('should retrieve a node run by ID', () => {
    const nodeRunId = store.createNodeRun({
      runId,
      appId: testAppId,
      stepId: 'step_1',
      stepType: 'llm_call',
    })

    const nodeRun = store.getNodeRun(nodeRunId)
    expect(nodeRun).not.toBeNull()
    expect(nodeRun!.id).toBe(nodeRunId)
    expect(nodeRun!.runId).toBe(runId)
    expect(nodeRun!.appId).toBe(testAppId)
    expect(nodeRun!.stepId).toBe('step_1')
    expect(nodeRun!.stepType).toBe('llm_call')
    expect(nodeRun!.status).toBe('pending')
    expect(nodeRun!.startedAt).toBeGreaterThan(0)
  })

  it('should return null for non-existent node run', () => {
    expect(store.getNodeRun('nonexistent')).toBeNull()
  })

  it('should update a node run status and output', () => {
    const nodeRunId = store.createNodeRun({
      runId,
      appId: testAppId,
      stepId: 'step_1',
      stepType: 'llm_call',
    })

    const output = { result: 'Hello, world!' }
    store.updateNodeRun(nodeRunId, {
      status: 'completed',
      output,
      finishedAt: Date.now(),
      durationMs: 500,
    })

    const nodeRun = store.getNodeRun(nodeRunId)
    expect(nodeRun!.status).toBe('completed')
    expect(nodeRun!.output).toEqual(output)
    expect(nodeRun!.durationMs).toBe(500)
  })

  it('should update a node run with error output', () => {
    const nodeRunId = store.createNodeRun({
      runId,
      appId: testAppId,
      stepId: 'step_1',
      stepType: 'tool_call',
    })

    store.updateNodeRun(nodeRunId, {
      status: 'error',
      error: 'Tool execution failed',
      finishedAt: Date.now(),
      durationMs: 200,
    })

    const nodeRun = store.getNodeRun(nodeRunId)
    expect(nodeRun!.status).toBe('error')
    expect(nodeRun!.output).toEqual({ error: 'Tool execution failed' })
  })

  it('should get all node runs for a run ordered by started_at', () => {
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const id = store.createNodeRun({
        runId,
        appId: testAppId,
        stepId: `step_${i}`,
        stepType: i === 2 ? 'condition' : 'llm_call',
      })
      ids.push(id)
    }

    // Complete them in order
    for (let i = 0; i < ids.length; i++) {
      store.updateNodeRun(ids[i], {
        status: 'completed',
        output: { index: i },
        finishedAt: Date.now() + i * 100,
        durationMs: 100,
      })
    }

    const nodeRuns = store.getNodeRunsForRun(runId)
    expect(nodeRuns).toHaveLength(3)
    expect(nodeRuns[0].stepId).toBe('step_0')
    expect(nodeRuns[1].stepId).toBe('step_1')
    expect(nodeRuns[2].stepId).toBe('step_2')
  })

  it('should return empty array for run with no node runs', () => {
    const nodeRuns = store.getNodeRunsForRun('run-with-no-nodes')
    expect(nodeRuns).toEqual([])
  })

  it('should create a node run with input', () => {
    const nodeRunId = store.createNodeRun({
      runId,
      appId: testAppId,
      stepId: 'step_1',
      stepType: 'tool_call',
      input: { url: 'https://example.com' },
    })

    const nodeRun = store.getNodeRun(nodeRunId)
    expect(nodeRun!.input).toEqual({ url: 'https://example.com' })
  })
})