# Visual Workflow Editor — Implementation Plan

> Spec: `docs/superpowers/specs/2026-07-11-visual-workflow-editor-design.md`

## Execution Order

Six sequential tasks. This is the most complex of the three directions — each task is a verifiable milestone.

---

## Task 1: Spec Schema Extension + Validation

**Files:**

| Action | Path |
|--------|------|
| Modify | `src/main/apps/spec/schema.ts` — add `WorkflowStepSchema` + `steps` field |
| Modify | `src/shared/apps/spec-types.ts` — export `WorkflowStep` type |
| Modify | `src/main/apps/spec/validate.ts` — validate `steps` DAG (no cycles, valid node refs) |
| Create | `tests/unit/apps/spec/workflow-steps.test.ts` |
| Modify | `tests/unit/apps/spec/validate.test.ts` — add workflow validation cases |

**Depends on:** Nothing (foundation for all subsequent tasks)

**Schema additions (`schema.ts`):**

```typescript
const LlmCallStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal('llm_call'),
  prompt: z.string().min(1),
  tools: z.array(z.string()).optional(),
  output: z.record(z.string()).optional(),
})

const ToolCallStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal('tool_call'),
  tool: z.string().min(1),
  params: z.record(z.unknown()).optional(),
})

const ConditionStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal('condition'),
  input: z.string().min(1),
  cases: z.array(z.object({
    when: z.object({
      eq: z.unknown().optional(),
      neq: z.unknown().optional(),
      contains: z.unknown().optional(),
      matches: z.string().optional(),
      gt: z.number().optional(),
      lt: z.number().optional(),
      gte: z.number().optional(),
      lte: z.number().optional(),
    }),
    goto: z.string().min(1),
  })).min(1),
  default: z.string().optional(),
})

const WorkflowStepSchema = z.discriminatedUnion('type', [
  LlmCallStepSchema,
  ToolCallStepSchema,
  ConditionStepSchema,
])
```

Add `steps: z.array(WorkflowStepSchema).optional()` to `AutomationSpecSchema`.

**DAG validation rules (`validate.ts`):**

1. All `goto` / `default` references must point to existing node ids
2. No cycles reachable from the entry node (first step)
3. At least one terminal node (node with no outgoing edge, or `tool_call` / `llm_call` with no next)
4. `condition` node must have at least one `case` with `goto`, or a `default`

**Test cases:**

```
describe('workflow steps schema')
  ✓ valid llm_call step parses
  ✓ valid tool_call step parses
  ✓ valid condition step parses
  ✓ steps array with all three node types parses
  ✓ invalid step type rejected
  ✓ missing required fields rejected

describe('workflow DAG validation')
  ✓ linear flow (a → b → c) valid
  ✓ conditional branch (a → b → c/d) valid
  ✓ goto references non-existent node → error
  ✓ cycle detected → error
  ✓ no terminal node → error
  ✓ condition with no cases and no default → error
  ✓ empty steps array → valid (treated as no workflow)
```

**Verification:**

- `npm run test:unit -- tests/unit/apps/spec/workflow-steps.test.ts` — all pass
- `npm run test:unit -- tests/unit/apps/spec/validate.test.ts` — all pass
- `npx tsc --noEmit` — no type errors
- Existing app specs without `steps` still validate (backward compatible)

---

## Task 2: Variable Resolution + Workflow Context

**Files:**

| Action | Path |
|--------|------|
| Create | `src/main/apps/runtime/workflow/types.ts` |
| Create | `src/main/apps/runtime/workflow/context.ts` |
| Create | `tests/unit/apps/runtime/workflow/context.test.ts` |

**Depends on:** Task 1 (types from spec)

**`types.ts`:**

```typescript
export interface WorkflowContext {
  trigger: TriggerContext
  memory: Record<string, unknown>
  steps: Record<string, Record<string, unknown>>
}

export interface NodeRunResult {
  nodeId: string
  status: 'completed' | 'error' | 'skipped'
  output: Record<string, unknown>
  error?: string
  nextNodeId?: string  // For condition nodes
}
```

**`context.ts`:**

```typescript
export function resolveVariables(
  text: string,
  context: WorkflowContext
): string

export function resolveObject(
  obj: Record<string, unknown>,
  context: WorkflowContext
): Record<string, unknown>
```

**Resolution rules:**

- `${node_id.field}` → `context.steps[node_id][field]`
- `${memory.field}` → `context.memory[field]`
- `${trigger.field}` → `context.trigger[field]`
- `${llm_result}` → special: only valid within the current node's output extraction
- Unresolvable reference → throw `VariableResolutionError`

**Test cases:**

```
describe('resolveVariables')
  ✓ '${step_1.price}' resolves from context.steps
  ✓ '${memory.lowest_price}' resolves from context.memory
  ✓ '${trigger.url}' resolves from context.trigger
  ✓ multiple references in one string
  ✓ no references → returns original string
  ✓ unresolvable reference → throws VariableResolutionError
  ✓ nested field '${step_1.output.price}' → context.steps.step_1.output.price

describe('resolveObject')
  ✓ resolves all string values in object
  ✓ leaves non-string values unchanged
  ✓ handles nested objects
```

**Verification:**

- `npm run test:unit -- tests/unit/apps/runtime/workflow/context.test.ts` — all pass

---

## Task 3: Node Executors

**Files:**

| Action | Path |
|--------|------|
| Create | `src/main/apps/runtime/workflow/nodes/llm-call.ts` |
| Create | `src/main/apps/runtime/workflow/nodes/tool-call.ts` |
| Create | `src/main/apps/runtime/workflow/nodes/condition.ts` |
| Create | `tests/unit/apps/runtime/workflow/nodes/llm-call.test.ts` |
| Create | `tests/unit/apps/runtime/workflow/nodes/tool-call.test.ts` |
| Create | `tests/unit/apps/runtime/workflow/nodes/condition.test.ts` |

**Depends on:** Task 2 (context + variable resolution)

**`llm-call.ts`:**

```typescript
export async function executeLlmCallNode(
  step: LlmCallStep,
  context: WorkflowContext,
  params: {
    systemPrompt: string          // from app spec
    mcpServers: McpServerSpec[]  // filtered by step.tools
    // SDK session creation params
  }
): Promise<NodeRunResult>
```

Flow:
1. Resolve variables in `step.prompt`
2. Filter MCP servers to only those providing tools in `step.tools`
3. Create SDK session via `createSession()`
4. Send resolved prompt as user message
5. Process stream until final text (no more tool_use)
6. Extract `llm_result` from final text
7. Parse `step.output` mapping → structured output
8. Close session
9. Return `NodeRunResult`

**`tool-call.ts`:**

```typescript
export async function executeToolCallNode(
  step: ToolCallStep,
  context: WorkflowContext,
  mcpTools: Map<string, McpToolHandler>
): Promise<NodeRunResult>
```

Flow:
1. Resolve variables in `step.params`
2. Find MCP tool by `step.tool` name
3. Call tool with resolved params
4. Return `NodeRunResult` with tool output

**`condition.ts`:**

```typescript
export function executeConditionNode(
  step: ConditionStep,
  context: WorkflowContext
): NodeRunResult
```

Flow:
1. Resolve `step.input` variable
2. Evaluate `cases` in order — first match wins
3. Operator evaluation: `eq`, `neq`, `contains`, `matches`, `gt`, `lt`, `gte`, `lte`
4. If no case matches → use `default`
5. If no `default` → throw `NoMatchingCaseError`
6. Return `NodeRunResult` with `nextNodeId`

**Test cases:**

```
describe('executeLlmCallNode')
  ✓ (mocked SDK) prompt resolved, session created, output extracted
  ✓ output mapping extracts fields from JSON response
  ✓ output mapping with non-JSON response → graceful failure
  ✓ tools filter: only listed tools registered

describe('executeToolCallNode')
  ✓ params resolved, tool called, output returned
  ✓ tool error → NodeRunResult with error
  ✓ missing tool → error

describe('executeConditionNode')
  ✓ eq operator: match → goto target
  ✓ eq operator: no match → next case
  ✓ contains operator
  ✓ gt/lt/gte/lte operators
  ✓ no case matches, has default → goto default
  ✓ no case matches, no default → NoMatchingCaseError
  ✓ input variable resolved before evaluation
```

**Verification:**

- `npm run test:unit -- tests/unit/apps/runtime/workflow/nodes/` — all pass

---

## Task 4: DAG Executor + Observability Store

**Files:**

| Action | Path |
|--------|------|
| Create | `src/main/apps/runtime/workflow/migrations.ts` |
| Create | `src/main/apps/runtime/workflow/store.ts` |
| Create | `src/main/apps/runtime/workflow/executor.ts` |
| Create | `src/main/apps/runtime/workflow/index.ts` |
| Modify | `src/main/apps/runtime/execute.ts` — branch on `spec.steps` |
| Modify | `src/main/apps/runtime/index.ts` — register workflow migrations |
| Create | `tests/unit/apps/runtime/workflow/executor.test.ts` |
| Create | `tests/unit/apps/runtime/workflow/store.test.ts` |

**Depends on:** Task 2 + Task 3

**`migrations.ts`:**

```typescript
export const workflowMigrations: Migration[] = [
  {
    version: 1,
    description: 'Create workflow_runs and workflow_node_runs tables',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_runs (
          id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          status TEXT NOT NULL,
          current_node_id TEXT,
          started_at INTEGER NOT NULL,
          completed_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS workflow_node_runs (
          id TEXT PRIMARY KEY,
          workflow_run_id TEXT NOT NULL,
          node_id TEXT NOT NULL,
          node_type TEXT NOT NULL,
          status TEXT NOT NULL,
          input TEXT,
          output TEXT,
          error TEXT,
          started_at INTEGER,
          completed_at INTEGER,
          FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id)
        );
      `)
    },
  },
]
```

**`store.ts`:**

- `createWorkflowRun(appId)` → insert + return id
- `updateWorkflowRun(id, { status, currentNodeId, completedAt })`
- `createNodeRun(workflowRunId, nodeId, nodeType)` → insert + return id
- `updateNodeRun(id, { status, input, output, error, completedAt })`
- `getWorkflowRun(id)` → run + all node runs (for replay)

**`executor.ts` — `executeWorkflow()`:**

1. Parse `spec.steps` into node map + edge map
2. Init `WorkflowContext` (trigger + memory snapshot)
3. Create `workflow_runs` record
4. Find entry node (first step)
5. Execution loop:
   - Record `workflow_node_runs` (status: running)
   - Resolve variables in node config
   - Dispatch to node executor (`llm_call` / `tool_call` / `condition`)
   - Record `workflow_node_runs` (status: completed/error, output, timing)
   - For `condition`: read `nextNodeId`, jump to it
   - For `llm_call` / `tool_call`: find next node by edge map (or terminal if none)
   - Update `workflow_runs.current_node_id`
   - If node error → stop, set `workflow_runs.status = 'error'`
   - If terminal node → stop, set `workflow_runs.status = 'completed'`
6. Emit activity entries
7. Broadcast `workflow:run-status` event

**`execute.ts` branch:**

```typescript
async function executeRun(params: ExecuteRunParams): Promise<AppRunResult> {
  const spec = params.app.spec
  if (spec.steps && spec.steps.length > 0) {
    return executeWorkflow(params)
  }
  return executeAutonomousRun(params)  // renamed existing logic
}
```

**Test cases:**

```
describe('executeWorkflow')
  ✓ (mocked nodes) linear flow a → b → c executes in order
  ✓ condition branch: true case → follows then path
  ✓ condition branch: false case → follows else path
  ✓ condition branch: no match, has default → follows default
  ✓ condition branch: no match, no default → error
  ✓ node error → workflow stops, status 'error'
  ✓ terminal node → workflow completes
  ✓ variable from step_1 available in step_2
  ✓ workflow_node_runs records created for each node
  ✓ workflow_runs status updated correctly

describe('workflow store')
  ✓ createWorkflowRun inserts record
  ✓ updateWorkflowRun updates fields
  ✓ createNodeRun inserts record
  ✓ updateNodeRun updates fields
  ✓ getWorkflowRun returns run + node runs
```

**Verification:**

- `npm run test:unit -- tests/unit/apps/runtime/workflow/` — all pass
- `npx tsc --noEmit` — no type errors
- App starts, workflow migrations run
- Existing apps without `steps` still execute via `executeAutonomousRun`

---

## Task 5: IPC + Renderer API + Execution Replay

**Files:**

| Action | Path |
|--------|------|
| Create | `src/main/ipc/workflow.ts` |
| Modify | `src/preload/index.ts` — add workflow API methods |
| Modify | `src/renderer/api/index.ts` — add workflow API adapter |
| Modify | `src/renderer/api/transport.ts` — add `workflow:run-status` event to methodMap |
| Modify | `src/main/http/routes/index.ts` — add `GET /api/workflow/runs/:id` (remote read-only) |
| Create | `src/renderer/components/workflow/ExecutionReplay.tsx` |
| Modify | `src/renderer/pages/AppsPage.tsx` — add "Run Replay" button |
| Create | `src/renderer/stores/workflow.store.ts` |

**Depends on:** Task 4 (observability data exists)

**IPC channels:**

| Channel | Direction | Renderer API |
|---------|-----------|--------------|
| `workflow:get-run` | request | `api.workflow.getRun(runId)` |
| `workflow:run-status` | event | `onWorkflowRunStatus(callback)` |

**Sync checklist:**

- `src/main/ipc/workflow.ts` — handler
- `src/preload/index.ts` — typed methods
- `src/renderer/api/index.ts` — adapter
- `src/renderer/api/transport.ts` — event methodMap
- `src/main/http/routes/workflow.routes.ts` — remote read-only GET

**`ExecutionReplay.tsx`:**

- React Flow graph (read-only)
- Nodes colored by status: `completed` (green), `running` (blue), `pending` (gray), `error` (red), `skipped` (muted)
- Click node → side panel with input/output/error
- Real-time updates via `workflow:run-status` event during active execution
- Responsive: touch zoom/pan on mobile

**`workflow.store.ts`:**

```typescript
interface WorkflowStore {
  currentRun: WorkflowRun | null
  loadRun: (runId: string) => Promise<void>
  subscribeToRun: (runId: string) => () => void  // returns unsubscribe
}
```

**Verification:**

- `npx tsc --noEmit` — no type errors
- Manual: trigger a workflow app, open Run Replay, verify node status coloring + input/output

---

## Task 6: Visual Editor UI

**Files:**

| Action | Path |
|--------|------|
| Modify | `package.json` — add `@xyflow/react` dependency |
| Create | `src/renderer/components/workflow/WorkflowEditor.tsx` |
| Create | `src/renderer/components/workflow/nodes/LlmCallNode.tsx` |
| Create | `src/renderer/components/workflow/nodes/ToolCallNode.tsx` |
| Create | `src/renderer/components/workflow/nodes/ConditionNode.tsx` |
| Create | `src/renderer/components/workflow/PropertyPanel.tsx` |
| Create | `src/renderer/components/workflow/WorkflowToolbar.tsx` |
| Create | `src/renderer/components/workflow/graph-serializer.ts` |
| Create | `tests/unit/renderer/workflow/graph-serializer.test.ts` |
| Modify | `src/renderer/pages/AppsPage.tsx` — add "Workflow" tab / "Create Workflow" button |

**Depends on:** Task 1 (spec schema) + Task 5 (replay infra)

**`graph-serializer.ts`:**

Pure functions:
- `graphToSteps(nodes: ReactFlowNode[], edges: ReactFlowEdge[]): WorkflowStep[]`
- `stepsToGraph(steps: WorkflowStep[]): { nodes: ReactFlowNode[], edges: ReactFlowEdge[] }`

**`WorkflowEditor.tsx`:**

- React Flow canvas (`@xyflow/react`)
- Custom node types: `llm_call`, `tool_call`, `condition`
- Node palette sidebar: drag nodes onto canvas
- Property panel: edit selected node's properties
- Toolbar: Save, Test, Cancel
- Lazy load React Flow (dynamic import) — no impact on other pages
- Desktop only: `hidden sm:block` on editor container; mobile shows "Please edit on desktop" message

**Node components:**

- `LlmCallNode` — Icon + title + prompt preview
- `ToolCallNode` — Icon + title + tool name
- `ConditionNode` — Diamond shape + cases summary
- All styled with theme tokens, no default React Flow styles

**`PropertyPanel.tsx`:**

- Edit selected node's fields based on type:
  - `llm_call`: prompt textarea, tools list, output mapping
  - `tool_call`: tool name select, params editor
  - `condition`: input variable, cases editor (when + goto), default

**Save flow:**

1. `graphToSteps(nodes, edges)` → `WorkflowStep[]`
2. Update app spec via `api.app.updateApp(appId, { spec: { ...spec, steps } })`
3. Close editor

**Test cases:**

```
describe('graphToSteps')
  ✓ linear graph → steps array in order
  ✓ graph with condition branch → steps with cases
  ✓ isolated node (no edges) → step with no outgoing

describe('stepsToGraph')
  ✓ linear steps → graph with connected nodes
  ✓ steps with condition → graph with branch edges
  ✓ roundtrip: steps → graph → steps === original steps
```

**Verification:**

- `npm run test:unit -- tests/unit/renderer/workflow/graph-serializer.test.ts` — all pass
- `npm run i18n` — new keys extracted
- Manual (desktop):
  - Open editor, drag nodes, connect them
  - Edit node properties in panel
  - Save → verify spec YAML contains `steps`
  - Reopen editor → graph loads from spec
  - Trigger app → verify execution follows DAG
  - Open Run Replay → verify node status coloring
- Manual (mobile):
  - Editor shows "Please edit on desktop"
  - Run Replay is usable (touch zoom/pan)

**New i18n keys:**

- `'Workflow'`, `'Create Workflow'`, `'Edit Workflow'`
- `'Add Node'`, `'LLM Call'`, `'Tool Call'`, `'Condition'`
- `'Save Workflow'`, `'Test Workflow'`
- `'Execution Replay'`, `'Node Input'`, `'Node Output'`
- `'No matching case'`, `'Variable resolution failed'`
- `'Please edit on desktop'`

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Spec schema breaks existing app validation | Low | Task 1 includes backward compatibility tests |
| DAG cycle detection algorithm complexity | Medium | Use DFS-based detection; unit test thoroughly |
| `llm_call` session-per-node performance | Medium | Acceptable for Phase 1 (3-8 nodes); profile in Phase 2 |
| React Flow bundle size | Low | Lazy load — only editor page imports it |
| React Flow custom node styling conflicts with theme | Medium | Use theme tokens, override default styles explicitly |
| Graph serializer edge cases (orphan nodes, multi-input nodes) | Medium | Unit test roundtrip serialization |
| IPC sync missing file | High | Use `quick.md` checklist for Task 5; verify each file |
| `execute.ts` branch introduces regression in autonomous mode | Medium | Keep autonomous path unchanged; test existing apps still work |

## Rollback

1. Revert `AppsPage.tsx` — removes editor + replay UI
2. Delete `src/renderer/components/workflow/`
3. Delete `src/renderer/stores/workflow.store.ts`
4. Revert `execute.ts` — removes workflow branch
5. Delete `src/main/apps/runtime/workflow/`
6. Revert `src/main/ipc/workflow.ts` + preload + renderer API + HTTP route
7. Revert `schema.ts` — removes `steps` field
8. Remove `@xyflow/react` from `package.json`

Database tables (`workflow_runs`, `workflow_node_runs`) remain — harmless. Apps with `steps` in their spec will fail validation after rollback — user needs to manually remove `steps` from affected app specs (or the spec validator ignores unknown fields, which Zod's default behavior does unless `.strict()` is used).

## Implementation Notes

- **Autonomous mode rename:** The existing `executeRun()` logic should be extracted to `executeAutonomousRun()` to make the branch clear. This is a rename, not a logic change.
- **MCP server filtering:** `llm_call` node's `tools` array requires resolving which MCP servers provide which tools. This mapping is available from `mcp-manager.ts`.
- **Workflow context memory:** The memory snapshot is read once at workflow start (via existing `buildMemorySnapshot`). It is not updated mid-workflow. Memory updates happen after the workflow completes (via existing session summary saving).
