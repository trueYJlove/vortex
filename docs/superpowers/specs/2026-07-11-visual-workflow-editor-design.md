# Visual Workflow Editor — Design

## Background

Halo's digital humans (automation apps) are defined by YAML specs where a `system_prompt` string drives the AI to autonomously decide execution steps. This model has three pain points:

1. **High barrier** — Creating an app requires writing YAML and crafting precise natural-language prompts. Non-technical users cannot self-serve.
2. **Uncontrollable** — AI autonomous decisions mean execution paths vary between runs. "Notify when price drops >5%" may be inconsistently followed due to prompt interpretation drift.
3. **Invisible** — Users cannot see the complete workflow. They read `system_prompt` to imagine what the app does. When a run fails, they know it failed but not which step failed.

The Visual Workflow Editor introduces an optional `steps` field in the app spec, enabling users to define explicit node-based workflows with conditional branching, visual editing, and per-node execution observability.

## Goal

Deliver a complete minimal closed loop:

1. **User drags nodes on a canvas** — React Flow-based visual editor with `llm_call`, `tool_call`, and `condition` node types.
2. **User connects nodes** — Defines edges including conditional branches.
3. **User edits node properties** — Prompts, tool selections, conditions via property panels.
4. **Editor saves to spec** — Generates valid `steps` YAML in the app spec.
5. **Runtime detects `steps` field** — Routes to the workflow execution engine instead of the autonomous AI mode.
6. **Engine executes the DAG** — Linear traversal with conditional branching, reusing existing session/memory/MCP infrastructure.
7. **Execution is observable** — `workflow_runs` and `workflow_node_runs` tables record per-node status, input, output, and timing.
8. **User views execution replay** — Flow chart with node status coloring (green=completed, blue=running, gray=pending, red=error) + click node to inspect input/output.

## Non-Goals

- **No loop / iteration nodes.** Phase 1 supports `llm_call`, `tool_call`, `condition` only. Loop and sub-workflow nodes are Phase 2.
- **No `human_review` node.** Human-in-the-loop approval is Phase 2.
- **No `code` node.** Arbitrary JavaScript execution is deferred for security review.
- **No replacement of the autonomous AI mode.** Apps without `steps` continue to use the existing `executeRun()` path. Both modes coexist.
- **No migration of existing apps.** Existing apps continue to work without modification.
- **No workflow editor on mobile.** The editor is desktop-only (`sm:` and above). Mobile users can view but not edit workflows.
- **No workflow sharing or templates.** Phase 2.
- **No deep nesting.** No sub-workflow nodes in Phase 1.

## Architecture

### Spec Schema Extension

New optional `steps` field on `AutomationSpec`:

```yaml
type: automation
name: price-monitor
description: "Monitor price and notify on significant drops"
system_prompt: "You are a price monitoring assistant"  # Used as base context for llm_call nodes

steps:
  - id: fetch_price
    type: llm_call
    prompt: "Use the browser to visit {{url}} and extract the current price of {{product}}. Return the price as a number."
    tools: ["browser_navigate", "browser_snapshot", "browser_evaluate"]
    output:
      price: "${llm_result}"

  - id: compare
    type: llm_call
    prompt: "Compare current price {{fetch_price.price}} with historical lowest {{memory.lowest_price}}. Return JSON: {\"dropped\": bool, \"percent\": number}"
    output:
      dropped: "${llm_result.dropped}"
      percent: "${llm_result.percent}"

  - id: branch
    type: condition
    input: "${compare.dropped}"
    cases:
      - when:
          eq: true
        goto: notify
      - default: update_memory

  - id: notify
    type: tool_call
    tool: halo-notify
    params:
      message: "Price dropped by {{compare.percent}}%!"

  - id: update_memory
    type: tool_call
    tool: memory-write
    params:
      content: "Updated price: {{fetch_price.price}}"
```

**Zod schema additions** (in `src/main/apps/spec/schema.ts`):

```typescript
const WorkflowStepSchema = z.discriminatedUnion('type', [
  LlmCallStepSchema,
  ToolCallStepSchema,
  ConditionStepSchema,
])

const LlmCallStepSchema = z.object({
  id: z.string(),
  type: z.literal('llm_call'),
  prompt: z.string(),
  tools: z.array(z.string()).optional(),      // MCP tools available to this node
  output: z.record(z.string()).optional(),     // Variable extraction mapping
})

const ToolCallStepSchema = z.object({
  id: z.string(),
  type: z.literal('tool_call'),
  tool: z.string(),                            // MCP tool name
  params: z.record(z.unknown()).optional(),    // Tool parameters
})

const ConditionStepSchema = z.object({
  id: z.string(),
  type: z.literal('condition'),
  input: z.string(),                           // Variable reference
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
    goto: z.string(),
  })).min(1),
  default: z.string().optional(),              // Fallback node id
})

const AutomationSpecSchema = AppSpecCommonSchema.extend({
  type: z.literal('automation'),
  system_prompt: z.string(),
  subscriptions: z.array(SubscriptionDefSchema).optional(),
  filters: z.array(FilterRuleSchema).optional(),
  memory_schema: z.record(MemoryFieldSchema).optional(),
  output: OutputSchema.optional(),
  escalation: EscalationSchema.optional(),
  // NEW
  steps: z.array(WorkflowStepSchema).optional(),
})
```

### Variable Reference Syntax

Nodes communicate via `${node_id.field_name}` syntax:

- `${fetch_price.price}` — References the `price` field from the `fetch_price` node's output
- `${memory.lowest_price}` — References a value from the app's memory (read before workflow starts)
- `${trigger.url}` — References a field from the trigger context (e.g., webhook payload)
- `${llm_result}` — Special variable: the raw LLM response from the current `llm_call` node

**Resolution rules:**
1. Before executing a node, scan its `prompt` / `params` / `input` / `when` fields for `${...}` patterns.
2. Replace each reference with the resolved value from the workflow context.
3. If a reference cannot be resolved, the node fails with a `VariableResolutionError`.

**Workflow context object:**
```typescript
interface WorkflowContext {
  trigger: TriggerContext          // From the run trigger
  memory: Record<string, unknown> // From memory.md snapshot
  steps: Record<string, Record<string, unknown>>  // Outputs from completed nodes
}
```

### LLM Call Node — AI Autonomy Boundary

An `llm_call` node creates a lightweight SDK session with:
- `system_prompt` from the app spec as the base system prompt
- Node `prompt` as the user message
- `tools` field lists MCP tools available to this node (subset of registered MCP servers)
- AI can call tools within the node, but **cannot trigger node transitions**

The node completes when the AI produces a final text response (no more tool calls). The response is then parsed according to the `output` mapping:
- If `output` is defined and `llm_result` is JSON → extract fields by mapping
- If `output` is defined and `llm_result` is not JSON → attempt regex extraction, fail gracefully
- If `output` is undefined → `llm_result` is stored as-is, accessible via `${node_id.llm_result}`

**MCP tool availability:** Only tools listed in the `tools` array are registered for the node's session. This gives the workflow author precise control over what each step can do.

### DAG Execution Engine

New sub-module under `apps/runtime/`:

```
src/main/apps/runtime/
  workflow/                    ← NEW
    index.ts                   — executeWorkflow() entry
    executor.ts                — DAG traversal + node dispatch
    context.ts                 — WorkflowContext + variable resolution
    nodes/
      llm-call.ts              — LLM call node executor
      tool-call.ts             — MCP tool call node executor
      condition.ts             — Condition branch node executor
    types.ts                   — WorkflowStep, WorkflowContext, NodeRunResult
    store.ts                   — workflow_runs + workflow_node_runs DB operations
    migrations.ts              — Workflow tables migrations
```

**`executeWorkflow()` flow:**

1. Load spec, parse `steps` into an in-memory DAG (node map + edge map).
2. Initialize `WorkflowContext` with trigger context + memory snapshot.
3. Find the entry node (first step in the array).
4. Execute nodes in sequence:
   - Resolve variable references in node config using `WorkflowContext`.
   - Dispatch to the node-type-specific executor.
   - Record `workflow_node_runs` entry (status, input, output, timing).
   - For `condition` nodes: evaluate `cases` in order, follow the matching `goto` or `default`.
   - For `llm_call` / `tool_call` nodes: store output in `context.steps[node_id]`.
5. Continue until a node has no outgoing edge (terminal node).
6. Record `workflow_runs` final status.
7. Emit activity entries for user-visible milestones.

**Integration with existing `execute.ts`:**

```typescript
// apps/runtime/execute.ts
async function executeRun(params: ExecuteRunParams): Promise<AppRunResult> {
  const spec = params.app.spec

  // NEW: Branch on workflow mode
  if (spec.steps && spec.steps.length > 0) {
    return executeWorkflow(params)    // → workflow/index.ts
  }

  // Existing autonomous AI mode — unchanged
  return executeAutonomousRun(params)
}
```

**Shared infrastructure (reused by both modes):**
- Session management (`session-manager.ts`)
- Memory snapshot injection (`platform/memory/snapshot.ts`)
- MCP server registration (`mcp-manager.ts`)
- Activity store (`runtime/store.ts`)
- Concurrency control (`concurrency.ts`)
- Report tool (`report-tool.ts`) — `llm_call` nodes can use `report_to_user` to end the workflow

### Execution Observability

**New tables (namespace: `workflow`):**

```sql
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,                  -- = automation_runs.id
  app_id TEXT NOT NULL,
  status TEXT NOT NULL,                 -- 'running' | 'completed' | 'error'
  current_node_id TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE workflow_node_runs (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,                -- spec step id
  node_type TEXT NOT NULL,              -- 'llm_call' | 'tool_call' | 'condition'
  status TEXT NOT NULL,                 -- 'pending' | 'running' | 'completed' | 'error' | 'skipped'
  input TEXT,                           -- JSON serialized
  output TEXT,                          -- JSON serialized
  error TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id)
);
```

**IPC channels:**

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `workflow:get-run` | request | Get workflow run + all node runs |
| `workflow:run-status` | event | Real-time node status updates during execution |

**Sync checklist:**
- `src/main/ipc/workflow.ts` — handler
- `src/preload/index.ts` — typed method
- `src/renderer/api/index.ts` — unified call
- `src/renderer/api/transport.ts` — event methodMap
- HTTP route (remote-capable: read-only `GET /api/workflow/runs/:id`)

### Visual Editor (Renderer)

New renderer module:

```
src/renderer/components/workflow/       ← NEW directory
  WorkflowEditor.tsx                   — React Flow canvas + property panel
  nodes/
    LlmCallNode.tsx                    — Custom React Flow node for llm_call
    ToolCallNode.tsx                   — Custom React Flow node for tool_call
    ConditionNode.tsx                  — Custom React Flow node for condition
  PropertyPanel.tsx                    — Edit selected node's properties
  ExecutionReplay.tsx                  — Read-only flow chart with status coloring
  WorkflowToolbar.tsx                  — Save, test, cancel actions
```

**React Flow integration:**
- Package: `@xyflow/react` (React Flow v12)
- Loaded lazily — only when the workflow editor page is opened
- Custom node types registered with React Flow's `nodeTypes` prop
- Node styling: Tailwind + theme tokens, no default React Flow styles
- Edges: Bezier curves with arrowheads, conditional edges labeled with `when` conditions

**Editor entry point:**
- In `AppsPage.tsx`, when editing an automation app, a new "Workflow" tab appears if the app has `steps` (or a "Create Workflow" button if it doesn't)
- Clicking opens the `WorkflowEditor` in a modal or full-page view
- Saving serializes the React Flow graph back to `steps` YAML in the spec

**Graph ↔ Spec serialization:**
- `graphToSteps(nodes, edges)` — Convert React Flow graph to `WorkflowStep[]`
- `stepsToGraph(steps)` — Convert `WorkflowStep[]` to React Flow nodes + edges
- Both are pure functions, unit-testable

**Execution Replay:**
- In the App detail page, a "Run Replay" button opens `ExecutionReplay`
- Renders the workflow as a read-only React Flow graph
- Nodes colored by status: `completed` (green), `running` (blue), `pending` (gray), `error` (red), `skipped` (muted)
- Click a node → side panel shows input/output/error
- Real-time updates via `workflow:run-status` event during active execution

**Responsive:**
- Editor: desktop only (`hidden sm:block` on the editor container). Mobile shows a "Please edit on desktop" message.
- Execution Replay: responsive — read-only graph is usable on mobile (zoom/pan via touch).

### LLM Call Node — Session Lifecycle

Each `llm_call` node creates a short-lived SDK session:

1. Build system prompt from app's `system_prompt` + node-specific context.
2. Build user message from node's `prompt` with variables resolved.
3. Register MCP servers: only those providing tools listed in the node's `tools` array.
4. Create session via `createSession()`.
5. Process stream until AI produces final text (no more tool_use blocks).
6. Extract `llm_result` from the final text block.
7. Parse `output` mapping and store in `WorkflowContext.steps[node_id]`.
8. Close session.

**Performance note:** Creating a session per `llm_call` node has overhead. For Phase 1 this is acceptable — typical workflows have 3-8 nodes. Session reuse optimization is a Phase 2 concern if profiling shows it's needed.

## Data Flow

```
User drags nodes in WorkflowEditor
  → graphToSteps() → spec.steps
  → save app → manager/store.ts

Trigger fires (schedule / event / IM)
  → executeRun() detects spec.steps
  → executeWorkflow()
    → init WorkflowContext (trigger + memory)
    → traverse DAG:
      → llm_call node:
        → create session → run AI → collect output → close session
        → record workflow_node_runs
      → tool_call node:
        → resolve params → call MCP tool → collect output
        → record workflow_node_runs
      → condition node:
        → evaluate cases → select next node
        → record workflow_node_runs (status: completed, output: selected_node_id)
    → terminal node reached
    → record workflow_runs final status
  → emit activity entries
  → broadcast workflow:run-status events

User views ExecutionReplay
  → api.workflow.getRun(runId)
  → render flow chart with node status coloring
```

## Performance

- **Session-per-node:** Acceptable for Phase 1 (3-8 nodes typical). Profile in Phase 2.
- **DAG traversal is synchronous:** Nodes execute sequentially. No parallel execution in Phase 1.
- **Variable resolution is in-memory:** `WorkflowContext` is a plain object, resolution is string interpolation — sub-millisecond.
- **Observability writes are batched:** `workflow_node_runs` entries are written in a single transaction at the end of each node execution.
- **React Flow is lazily loaded:** No impact on app startup or non-workflow pages.
- **No performance regression:** The entire workflow feature is opt-in — apps without `steps` are unaffected.

## Security

- **Variable reference isolation:** Only `WorkflowContext` fields are resolvable. No arbitrary code execution via template strings.
- **MCP tool whitelisting:** `llm_call` nodes can only use tools explicitly listed in the `tools` array.
- **No `code` node in Phase 1:** Arbitrary JavaScript execution is explicitly deferred for security review.
- **Spec validation:** Zod schema validation rejects invalid `steps` at install time, not just at runtime.
- **Variable resolution failure is non-fatal to the process:** Failed resolution produces a node-level error, not a crash.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Invalid `steps` (Zod validation fails) | App installation rejected with validation error |
| Variable reference cannot be resolved | Node fails with `VariableResolutionError`, workflow stops |
| `llm_call` AI does not produce final text | Node fails after max turns (10), workflow stops |
| `tool_call` tool returns error | Node fails with tool error, workflow stops |
| `condition` no case matches and no `default` | Node fails with `NoMatchingCaseError`, workflow stops |
| Terminal node has outgoing edge | Ignored — terminal is defined as "node with no matching next node" |
| Workflow references non-existent node id | Spec validation rejects at install time |

**Error propagation:** When a node fails, the workflow stops immediately. The error is recorded in `workflow_node_runs.error` and `workflow_runs.status` is set to `error`. An activity entry of type `run_error` is emitted.

## i18n

New user-facing strings:

- `'Workflow'`
- `'Create Workflow'`
- `'Edit Workflow'`
- `'Add Node'`
- `'LLM Call'`
- `'Tool Call'`
- `'Condition'`
- `'Save Workflow'`
- `'Test Workflow'`
- `'Execution Replay'`
- `'Node Input'`
- `'Node Output'`
- `'No matching case'`
- `'Variable resolution failed'`
- '{{node_id}} completed in {{duration}}s'`
- `'Please edit on desktop'`

Run `npm run i18n` before commit.

## Testing

### Unit Tests

`tests/unit/apps/runtime/workflow/`:

- `executor.test.ts` — DAG traversal, conditional branching, terminal detection
- `context.test.ts` — Variable resolution, missing variables, nested references
- `nodes/llm-call.test.ts` — LLM call session lifecycle, output extraction
- `nodes/tool-call.test.ts` — MCP tool invocation, param resolution
- `nodes/condition.test.ts` — Case evaluation, operator semantics, default fallback
- `store.test.ts` — workflow_runs + workflow_node_runs CRUD
- `migrations.test.ts` — Schema migration correctness

`tests/unit/renderer/workflow/`:

- `graph-to-steps.test.ts` — React Flow graph → spec steps serialization
- `steps-to-graph.test.ts` — Spec steps → React Flow graph deserialization

Run: `npm run test:unit -- tests/unit/apps/runtime/workflow/ tests/unit/renderer/workflow/`

### Manual Verification

- Create a simple workflow (3 nodes) via the visual editor
- Save and verify the spec YAML is correct
- Trigger the app and verify execution follows the DAG
- View Execution Replay and verify node status coloring matches execution
- Click nodes in replay and verify input/output is correct
- Test a condition branch with different inputs
- Test error scenarios (missing variable, tool error)
- Mobile: verify editor shows "Please edit on desktop", replay is usable

## Validation Checklist

- [ ] Unit tests pass
- [ ] `npm run i18n` clean
- [ ] TypeScript compiles
- [ ] `@xyflow/react` dependency added and lazily loaded
- [ ] Spec with `steps` validates correctly (Zod)
- [ ] Spec without `steps` continues to work (backward compatible)
- [ ] `executeRun()` branches correctly between autonomous and workflow modes
- [ ] Workflow with `llm_call` → `condition` → `tool_call` executes end-to-end
- [ ] `workflow_node_runs` records per-node status, input, output
- [ ] Execution Replay renders with correct node status coloring
- [ ] Editor is desktop-only; mobile shows fallback message
- [ ] Replay is usable on mobile (touch zoom/pan)

## Phase 2 Preview (Not in Scope)

- **Loop / iteration node** — `forEach` over array, `while` condition
- **Sub-workflow node** — Nested workflow as a single node
- **Human review node** — Pause workflow, send to user for approval, resume
- **Code node** — Execute JavaScript with sandboxed context (requires security review)
- **Parallel execution** — Multiple branches executing concurrently
- **Session reuse** — Share SDK session across `llm_call` nodes for context continuity
- **Workflow templates** — Pre-built workflows for common scenarios
- **Workflow sharing** — Export/import workflows between users
- **More node types** — `http_request`, `transform`, `delay`, `send_message`
