/**
 * Unit Tests: apps/runtime/workflow — DAG Executor
 *
 * Covers: linear execution, condition branching, error handling,
 * abort signal, validation, edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeWorkflow } from '../../../../../src/main/apps/runtime/workflow/executor'
import type { WorkflowStore } from '../../../../../src/main/apps/runtime/workflow/store'
import type { InstalledApp } from '../../../../../src/main/apps/manager'
import type { TriggerContext } from '../../../../../src/main/apps/runtime/types'

// ============================================
// Mock node executors
// ============================================

vi.mock('../../../../../src/main/apps/runtime/workflow/nodes/llm-call', () => ({
  executeLlmCallNode: vi.fn(),
}))

vi.mock('../../../../../src/main/apps/runtime/workflow/nodes/tool-call', () => ({
  executeToolCallNode: vi.fn(),
}))

vi.mock('../../../../../src/main/apps/runtime/workflow/nodes/condition', () => ({
  executeConditionNode: vi.fn(),
}))

import { executeLlmCallNode } from '../../../../../src/main/apps/runtime/workflow/nodes/llm-call'
import { executeToolCallNode } from '../../../../../src/main/apps/runtime/workflow/nodes/tool-call'
import { executeConditionNode } from '../../../../../src/main/apps/runtime/workflow/nodes/condition'

// ============================================
// Fixtures
// ============================================

function makeApp(steps: any[]): InstalledApp {
  return {
    id: 'app-test-001',
    specId: 'test-spec',
    spaceId: 'space-001',
    spec: {
      spec_version: '1',
      name: 'Test App',
      version: '1.0.0',
      author: 'Test',
      description: 'Test',
      type: 'automation',
      system_prompt: 'Test',
      subscriptions: [],
      steps,
    },
    status: 'active',
    userConfig: {},
    userOverrides: {},
    permissions: { granted: [], denied: [] },
    installedAt: Date.now(),
  } as InstalledApp
}

function makeTrigger(overrides?: Partial<TriggerContext>): TriggerContext {
  return {
    type: 'schedule',
    eventPayload: { time: '14:00' },
    ...overrides,
  }
}

function createMockStore(): WorkflowStore {
  return {
    createWorkflowRun: vi.fn().mockReturnValue('wf-run-001'),
    getWorkflowRun: vi.fn(),
    updateWorkflowRun: vi.fn(),
    getRunningRunForApp: vi.fn(),
    createNodeRun: vi.fn().mockReturnValue('wnr-node-001'),
    updateNodeRun: vi.fn(),
    getNodeRun: vi.fn(),
    getNodeRunsForRun: vi.fn(),
  } as unknown as WorkflowStore
}

function makeLlmDeps() {
  return { createSession: vi.fn(), processStream: vi.fn() }
}

function makeToolDeps() {
  return { tools: {} }
}

// ============================================
// Tests
// ============================================

describe('executeWorkflow', () => {
  let store: WorkflowStore
  let llmDeps: ReturnType<typeof makeLlmDeps>
  let toolDeps: ReturnType<typeof makeToolDeps>

  beforeEach(() => {
    vi.clearAllMocks()
    store = createMockStore()
    llmDeps = makeLlmDeps()
    toolDeps = makeToolDeps()
  })

  describe('validation', () => {
    it('should throw for non-automation app type', async () => {
      const app = makeApp([{ id: 's1', type: 'llm_call' }])
      app.spec.type = 'mcp' as any

      await expect(
        executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })
      ).rejects.toThrow('executeWorkflow called for non-automation app')
    })

    it('should throw for empty steps', async () => {
      const app = makeApp([])

      await expect(
        executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })
      ).rejects.toThrow('Workflow has no steps defined')
    })

    it('should throw for duplicate step IDs', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
        { id: 's1', type: 'tool_call' },
      ])

      await expect(
        executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })
      ).rejects.toThrow('Duplicate step id in workflow')
    })

    it('should throw for condition goto referencing unknown step', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
        { id: 'c1', type: 'condition', input: '${trigger.time}', cases: [{ when: { eq: '14:00' }, goto: 'nonexistent' }] },
      ])

      await expect(
        executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })
      ).rejects.toThrow('references unknown step')
    })

    it('should throw for condition default referencing unknown step', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
        { id: 'c1', type: 'condition', input: '${trigger.time}', cases: [{ when: { eq: 'wrong' }, goto: 's1' }], default: 'nonexistent' },
      ])

      await expect(
        executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })
      ).rejects.toThrow('references unknown step')
    })

    it('should allow condition goto to a later step', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
        { id: 'c1', type: 'condition', input: '${trigger.time}', cases: [{ when: { eq: '14:00' }, goto: 's3' }] },
        { id: 's3', type: 'tool_call' },
      ])
      vi.mocked(executeLlmCallNode).mockResolvedValue({ status: 'completed', output: { result: 'ok' } })
      vi.mocked(executeConditionNode).mockResolvedValue({ status: 'completed', output: {}, nextNodeId: 's3' })
      vi.mocked(executeToolCallNode).mockResolvedValue({ status: 'completed', output: { result: 'done' } })

      const result = await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      expect(result.outcome).toBe('useful')
      // s1, c1, s3 execute (3 steps total)
      expect(store.createNodeRun).toHaveBeenCalledTimes(3)
      expect(store.updateWorkflowRun).toHaveBeenCalledWith('wf-run-001', expect.objectContaining({ status: 'completed' }))
    })
  })

  describe('linear execution', () => {
    it('should execute llm_call steps in order', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
        { id: 's2', type: 'llm_call' },
      ])
      vi.mocked(executeLlmCallNode)
        .mockResolvedValueOnce({ status: 'completed', output: { result: 'first' } })
        .mockResolvedValueOnce({ status: 'completed', output: { result: 'second' } })

      const result = await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      expect(result.outcome).toBe('useful')
      expect(executeLlmCallNode).toHaveBeenCalledTimes(2)
      expect(store.createNodeRun).toHaveBeenCalledTimes(2)
      expect(store.updateWorkflowRun).toHaveBeenCalledWith('wf-run-001', expect.objectContaining({ status: 'completed' }))
    })

    it('should execute mixed step types in order', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
        { id: 's2', type: 'tool_call' },
      ])
      vi.mocked(executeLlmCallNode).mockResolvedValue({ status: 'completed', output: { text: 'hello' } })
      vi.mocked(executeToolCallNode).mockResolvedValue({ status: 'completed', output: { result: 'done' } })

      const result = await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      expect(result.outcome).toBe('useful')
      expect(executeLlmCallNode).toHaveBeenCalledTimes(1)
      expect(executeToolCallNode).toHaveBeenCalledTimes(1)
    })

    it('should pass context between steps', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call', prompt: 'Hello' },
        { id: 's2', type: 'tool_call', tool: 'echo', params: { msg: '${s1.text}' } },
      ])
      vi.mocked(executeLlmCallNode).mockResolvedValue({ status: 'completed', output: { text: 'world' } })
      vi.mocked(executeToolCallNode).mockResolvedValue({ status: 'completed', output: { result: 'world echoed' } })

      const result = await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      expect(result.outcome).toBe('useful')
      // Verify context was passed: s2's params should include s1's output
      const s2Call = vi.mocked(executeToolCallNode).mock.calls[0]
      const s2Context = s2Call[1]
      expect(s2Context.steps['s1']).toEqual({ text: 'world' })
    })
  })

  describe('condition branching', () => {
    it('should follow condition goto target', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
        { id: 'c1', type: 'condition', input: '${trigger.time}', cases: [{ when: { eq: '14:00' }, goto: 's3' }], default: 's4' },
        { id: 's3', type: 'tool_call' },
        { id: 's4', type: 'tool_call' },
      ])
      vi.mocked(executeLlmCallNode).mockResolvedValue({ status: 'completed', output: { result: 'ok' } })
      vi.mocked(executeConditionNode).mockResolvedValue({ status: 'completed', output: { matched: '14:00' }, nextNodeId: 's3' })
      vi.mocked(executeToolCallNode).mockResolvedValue({ status: 'completed', output: { result: 'branch executed' } })

      const result = await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      expect(result.outcome).toBe('useful')
      // s1, c1, s3, s4 all execute (condition redirects to s3, then continues linearly through s4)
      expect(store.createNodeRun).toHaveBeenCalledTimes(4)
    })

    it('should follow condition default when no case matches', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
        { id: 'c1', type: 'condition', input: '${trigger.time}', cases: [{ when: { eq: 'never' }, goto: 's3' }], default: 's4' },
        { id: 's3', type: 'tool_call' },
        { id: 's4', type: 'tool_call' },
      ])
      vi.mocked(executeLlmCallNode).mockResolvedValue({ status: 'completed', output: { result: 'ok' } })
      vi.mocked(executeConditionNode).mockResolvedValue({ status: 'completed', output: { matched: 'default' }, nextNodeId: 's4' })
      vi.mocked(executeToolCallNode).mockResolvedValue({ status: 'completed', output: { result: 'default executed' } })

      const result = await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      expect(result.outcome).toBe('useful')
      expect(store.createNodeRun).toHaveBeenCalledTimes(3)
      // s4 should have been executed
      expect(vi.mocked(executeToolCallNode).mock.calls[0][0].id).toBe('s4')
    })

    it('should stop when no more steps after condition', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
        { id: 'c1', type: 'condition', input: '${trigger.time}', cases: [{ when: { eq: '14:00' }, goto: 's1' }] },
      ])
      vi.mocked(executeLlmCallNode).mockResolvedValue({ status: 'completed', output: { result: 'ok' } })

      // Execution should stop after the condition (no more steps forward)
      const result = await executeWorkflow({ app, trigger: makeTrigger({ eventPayload: { time: 'other' } }), workflowStore: store, llmDeps, toolDeps })

      expect(result.outcome).toBe('useful')
      // Only s1 should have been visited (condition is second but no next step)
      expect(store.createNodeRun).toHaveBeenCalledTimes(2)
    })
  })

  describe('error handling', () => {
    it('should report error when a node fails', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
        { id: 's2', type: 'llm_call' },
      ])
      vi.mocked(executeLlmCallNode)
        .mockResolvedValueOnce({ status: 'completed', output: { result: 'ok' } })
        .mockResolvedValueOnce({ status: 'error', output: {}, error: 'LLM call failed' })

      const result = await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      expect(result.outcome).toBe('error')
      expect(result.errorMessage).toBe('LLM call failed')
      // Node run should be recorded with error
      expect(store.updateNodeRun).toHaveBeenCalled()
      // Workflow should be updated with error status
      expect(store.updateWorkflowRun).toHaveBeenCalledWith('wf-run-001', expect.objectContaining({ status: 'error' }))
    })

    it('should handle exceptions thrown by node executors', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
      ])
      vi.mocked(executeLlmCallNode).mockRejectedValue(new Error('Unexpected crash'))

      const result = await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      expect(result.outcome).toBe('error')
      expect(result.errorMessage).toBe('Unexpected crash')
    })

    it('should handle unknown step type', async () => {
      const app = makeApp([
        { id: 's1', type: 'unknown_type' as any },
      ])

      const result = await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      expect(result.outcome).toBe('error')
      expect(result.errorMessage).toContain('Unknown step type')
    })

    it('should record error in node run when node fails', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
      ])
      vi.mocked(executeLlmCallNode).mockResolvedValue({ status: 'error', output: {}, error: 'Failed' })

      const result = await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      expect(result.outcome).toBe('error')
      // Verify node run was updated with error status
      expect(store.updateNodeRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'error', error: 'Failed' })
      )
    })
  })

  describe('abort signal', () => {
    it('should stop execution when aborted', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
        { id: 's2', type: 'llm_call' },
        { id: 's3', type: 'llm_call' },
      ])
      vi.mocked(executeLlmCallNode).mockResolvedValue({ status: 'completed', output: { result: 'ok' } })

      const abortController = new AbortController()
      // Abort after first step
      vi.mocked(executeLlmCallNode).mockImplementationOnce(async () => {
        abortController.abort()
        return { status: 'completed', output: { result: 'ok' } }
      })

      const result = await executeWorkflow({
        app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps,
        abortSignal: abortController.signal,
      })

      // Execution should complete (not throw) but only first step executed
      expect(executeLlmCallNode).toHaveBeenCalledTimes(1)
      // The result should show as completed since no error occurred
      // The workflow was just stopped early
    })
  })

  describe('result format', () => {
    it('should return AppRunResult with correct fields', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
      ])
      vi.mocked(executeLlmCallNode).mockResolvedValue({ status: 'completed', output: { result: 'ok' } })

      const result = await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      expect(result).toMatchObject({
        appId: 'app-test-001',
        runId: 'wf-run-001',
        sessionKey: expect.stringContaining('wf-'),
        outcome: 'useful',
      })
      expect(result.startedAt).toBeGreaterThan(0)
      expect(result.finishedAt).toBeGreaterThan(0)
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('should include errorMessage when workflow fails', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
      ])
      vi.mocked(executeLlmCallNode).mockResolvedValue({ status: 'error', output: {}, error: 'Failed' })

      const result = await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      expect(result.outcome).toBe('error')
      expect(result.errorMessage).toBe('Failed')
    })
  })

  describe('workflow run lifecycle', () => {
    it('should create workflow run on start', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
      ])
      vi.mocked(executeLlmCallNode).mockResolvedValue({ status: 'completed', output: { result: 'ok' } })

      await executeWorkflow({ app, trigger: makeTrigger({ type: 'webhook', eventPayload: { event: 'push' } }), workflowStore: store, llmDeps, toolDeps })

      expect(store.createWorkflowRun).toHaveBeenCalledWith({
        appId: 'app-test-001',
        triggerType: 'webhook',
        triggerData: { event: 'push' },
        flowDefinitionJson: expect.any(String),
      })
    })

    it('should finalize workflow run on completion', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
      ])
      vi.mocked(executeLlmCallNode).mockResolvedValue({ status: 'completed', output: { result: 'ok' } })

      await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      expect(store.updateWorkflowRun).toHaveBeenCalledWith('wf-run-001', expect.objectContaining({
        status: 'completed',
        finishedAt: expect.any(Number),
        durationMs: expect.any(Number),
      }))
    })

    it('should create and update node runs for each step', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
        { id: 's2', type: 'tool_call' },
      ])
      vi.mocked(executeLlmCallNode).mockResolvedValue({ status: 'completed', output: { result: 'first' } })
      vi.mocked(executeToolCallNode).mockResolvedValue({ status: 'completed', output: { result: 'second' } })

      await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      // 2 node runs created, 2 node runs updated
      expect(store.createNodeRun).toHaveBeenCalledTimes(2)
      expect(store.updateNodeRun).toHaveBeenCalledTimes(2)
      // Verify node run IDs
      expect(store.createNodeRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 'wf-run-001', stepId: 's1', stepType: 'llm_call' })
      )
      expect(store.createNodeRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 'wf-run-001', stepId: 's2', stepType: 'tool_call' })
      )
    })

    it('should handle condition with no goto or default (stop)', async () => {
      const app = makeApp([
        { id: 's1', type: 'llm_call' },
        { id: 'c1', type: 'condition', input: '${trigger.time}', cases: [{ when: { eq: 'never' }, goto: 's1' }] },
        { id: 's3', type: 'tool_call' },
      ])
      vi.mocked(executeLlmCallNode).mockResolvedValue({ status: 'completed', output: { result: 'ok' } })
      // Condition returns no nextNodeId (no match, no default)
      vi.mocked(executeConditionNode).mockResolvedValue({ status: 'completed', output: {} })

      const result = await executeWorkflow({ app, trigger: makeTrigger(), workflowStore: store, llmDeps, toolDeps })

      // Should stop at condition and not execute s3
      expect(result.outcome).toBe('useful')
      expect(store.createNodeRun).toHaveBeenCalledTimes(2)
    })
  })
})