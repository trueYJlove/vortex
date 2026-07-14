# Agent Reasoning Visualization — Phase 1 Design

## Background

Halo positions itself as turning Claude Code — a "DOS-era AI" — into a "Windows-era AI companion." A core pillar of that vision is making the agent's reasoning process直观 and understandable.

Today, the `ThoughtProcess` and `CollapsedThoughtProcess` components render agent thoughts as a **flat list** — one row per thought, with timeline dots and vertical connector lines. The data already contains everything needed for a richer visualization (type, tool name, input/output, duration, parent-child relationships for sub-agents), but the presentation does not group related thoughts into higher-level "steps."

Phase 1 introduces a **step-card view** as an alternative to the list view, selectable via a toggle in the `ThoughtProcess` header. Default remains the list view — fully backward compatible.

## Goal

Deliver a usable step-card view that groups consecutive same-type thoughts into a single visual step, with expand/collapse for tool input/output and nested sub-agent timelines.

User-visible outcome: clicking a toggle in the thought panel switches from the flat list to a sequence of step cards, each representing one "unit" of agent activity (a thought, a tool call, a text block, an error).

## Non-Goals

- **No arrow connectors between steps.** Phase 2.
- **No timeline proportion bar.** Phase 2.
- **No step view in `CollapsedThoughtProcess`** (history messages). Phase 2.
- **No deep recursive rendering of sub-agent steps.** Sub-agent thoughts continue to render via the existing `SubAgentTimeline` component, one level deep — matching the current product convention.
- **No component render tests.** Project convention for renderer tests covers store behavior, not React component rendering. `StepCard` is verified manually via the real data path enabled by the view toggle.
- **No shared component extraction from `ThoughtItem`.** `StepCard` self-implements its content rendering. Extraction is deferred until duplication actually becomes a maintenance burden.

## Architecture

### New Files

#### 1. `src/renderer/components/chat/thoughts-to-steps.ts`

Pure function module. No React dependency. Imports only types and `thought-utils.ts` helpers (`getToolFriendlyFormat`).

**Types:**

```typescript
export type StepKind = 'thinking' | 'tool_call' | 'text' | 'error' | 'system'

export type StepStatus = 'streaming' | 'running' | 'completed' | 'error'

export interface FlowStep {
  id: string                    // Derived from first thought id
  kind: StepKind
  title: string                 // "Thinking" / "Read" / "AI" — plain English, translated at render time
  subtitle?: string             // Friendly summary from getToolFriendlyFormat
  thoughts: Thought[]           // Original thoughts composing this step
  startTime: number             // First thought timestamp (ms)
  duration?: number             // Last - first (ms)
  status: StepStatus
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: { output: string; isError: boolean; timestamp: string }
  taskProgress?: TaskProgress
}
```

**Function: `thoughtsToSteps(thoughts: Thought[]): FlowStep[]`**

Algorithm:

1. **Filter** — exclude `type === 'result'`, `toolName === 'TodoWrite'`, `parentToolUseId` non-empty (sub-agent thoughts are not converted in the main flow).
2. **Sequential traversal** — group by type:
   - Consecutive `thinking` → merge into one `thinking` step.
   - Consecutive `text` → merge into one `text` step.
   - `tool_use` → standalone `tool_call` step (includes merged `toolResult`).
   - `error` → standalone `error` step.
   - `system` → standalone `system` step.
   - **No cross-type merging.** A `thinking` followed by `tool_use` produces two steps.
3. **Status inference:**
   - `streaming` — `isStreaming === true`
   - `running` — `tool_use` with `isReady === true` but no `toolResult`
   - `completed` — has `toolResult` with `!isError`, or non-tool step that is not streaming
   - `error` — has `toolResult` with `isError`, or `type === 'error'`
4. **Title generation** (plain English key, translated at render):
   - `thinking` → `'Thinking'`
   - `text` → `'AI'`
   - `tool_call` → `toolName` (e.g. `'Read'`, `'Bash'`)
   - `error` → `'Error'`
   - `system` → `'System'`
5. **Subtitle** — `tool_call` uses `getToolFriendlyFormat(toolName, toolInput)`; other kinds omit subtitle.

**Sub-agent handling:** `Task`/`Agent` tool_call steps do **not** recursively generate `subSteps` in the conversion layer. They retain `toolName` and `taskProgress`; `StepCard` embeds the existing `SubAgentTimeline` for one-level nested display — consistent with the current product convention.

**`id` derivation:** `${firstThought.id}` — sufficient as a React key since thought ids are unique within a session.

#### 2. `src/renderer/components/chat/StepCard.tsx`

React component rendering a single `FlowStep` as a card.

**Props:**

```typescript
interface StepCardProps {
  step: FlowStep
  allThoughts?: Thought[]       // Passed to embedded SubAgentTimeline
  isLast: boolean
  isThinking?: boolean          // Passed to SubAgentTimeline
}
```

**Visual structure:**

```
┌───────────────────────────────────────────────┐
│ [icon] [title]              [status] [⏱ x.xs] │  Header row (click to expand/collapse)
│ [subtitle muted]                              │  Friendly summary
├───────────────────────────────────────────────┤
│ [Expandable content area]                     │
│   thinking: italic text, expand/collapse      │
│   tool_call: JSON input + ToolResultViewer    │
│   error: ErrorContent                         │
│   system: muted text                          │
│                                                │
│   Task/Agent: embedded SubAgentTimeline       │
└───────────────────────────────────────────────┘
```

**Content rendering:** Self-implemented, reusing existing utilities:
- `getThoughtIcon` / `getThoughtColor` — icon and color
- `getToolFriendlyFormat` — subtitle
- `ToolResultViewer` — tool result display (when expanded)
- `SubAgentTimeline` — sub-agent nesting (only `Task`/`Agent` kinds)
- `ErrorContent` — error content
- `useTranslation` + `t('English text')` — i18n

**Styling rules:**
- Theme tokens only (`bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`, etc.) — no hardcoded colors.
- Mobile-first responsive: base classes for mobile, `sm:` for desktop.
- Card spacing: `gap-2` between cards; internal padding `px-3 py-2`.
- Header row: `flex items-center gap-2`, `flex-wrap` on mobile to prevent overflow.
- Timestamp and duration: `hidden sm:inline` — matches existing `ThoughtItem` convention.
- Expand/collapse: click header toggles content visibility. Default collapsed for completed steps, expanded for streaming/running steps.

#### 3. `tests/unit/renderer/thoughts-to-steps.test.ts`

Pure function unit tests covering:

- Empty input → `[]`
- Single `thinking` / `text` / `tool_use` / `error` / `system`
- Consecutive `thinking` merge into one step
- Consecutive `text` merge into one step
- `thinking` + `tool_use` → two separate steps (no cross-type merge)
- `tool_use` with `toolResult` → status `completed`
- `tool_use` with `toolResult.isError === true` → status `error`
- `tool_use` with `isStreaming === true` → status `streaming`
- `tool_use` with `isReady === true`, no `toolResult` → status `running`
- `type === 'TodoWrite'` filtered out
- `type === 'result'` filtered out
- `parentToolUseId` non-empty filtered out
- `duration` calculated from first to last thought timestamp in a merged step

### Modified Files

#### `src/renderer/components/chat/ThoughtProcess.tsx`

Minimal changes, backward compatible:

1. **New state:** `const [viewMode, setViewMode] = useState<'list' | 'steps'>('list')`
2. **Header toggle:** Two icon buttons (list icon / steps icon) placed before the expand chevron, visible only when `isExpanded`. Active mode highlighted with `text-primary`, inactive with `text-muted-foreground/50`.
3. **Content conditional render:**
   - `viewMode === 'list'` (default) → existing `displayThoughts.map(LazyThoughtItem)` **unchanged**
   - `viewMode === 'steps'` → `steps.map(step => <StepCard ... />)`
4. **Step conversion:** `const steps = useMemo(() => thoughtsToSteps(displayThoughts), [displayThoughts])`
5. **Scroll container reuse:** `contentRef`, `useSmartScroll`, `max-h-[300px]` / `max-h-[80vh]` all unchanged — both modes share the same scroll behavior.

**Unchanged:**
- Header collapse/expand logic
- Auto-expand on streaming start
- Auto-scroll logic
- Maximize toggle
- `displayThoughts` filter logic
- `CollapsedThoughtProcess` — not touched

### Unchanged

- `CollapsedThoughtProcess.tsx` — no step view in Phase 1.
- `SubAgentTimeline.tsx` — reused as-is, no modification.
- `thought-utils.ts` — reused as-is.
- `chat.store.ts` — no store changes.
- All backend modules — no changes.

## Data Flow

```
ChatStore
  sessions: Map<conversationId, SessionState>
    SessionState.thoughts: Thought[]
      │
      ▼
ThoughtProcess (props.thoughts)
  │
  ├─ displayThoughts = useMemo(filter, [thoughts])     ← existing
  │
  ├─ steps = useMemo(thoughtsToSteps, [displayThoughts])  ← new
  │
  ├─ viewMode === 'list'  → displayThoughts.map(LazyThoughtItem)   ← existing
  │
  └─ viewMode === 'steps' → steps.map(StepCard)                     ← new
                             │
                             └─ Task/Agent step → SubAgentTimeline  ← existing, reused
```

No new IPC channels. No new events. No new stores. The entire feature is renderer-internal.

## Performance

`thoughtsToSteps()` runs inside `useMemo` with `[displayThoughts]` dependency — same pattern as the existing `displayThoughts` filter. Full recompute on every thoughts change.

Rationale: Phase 1 targets validation of the step-card concept. The existing `ThoughtProcess` already does full `useMemo` filtering on `[thoughts]` without observed performance issues. If long conversations (100+ thoughts) show measurable lag in step mode, incremental optimization can be added later — but premature optimization in Phase 1 would add complexity without evidence of need.

## Responsive Design

- **View toggle buttons:** 14px icon size. Mobile: icon-only. Desktop (`sm:`): optional label.
- **StepCard:** `w-full` on mobile, `flex-wrap` header to prevent overflow. Timestamp/duration `hidden sm:inline` — matches `ThoughtItem`.
- **Step content area:** `break-words` + `overflow-x-auto` for long tool output — matches existing `ThoughtItem` behavior.
- **Sub-agent nesting:** `SubAgentTimeline` is already responsive — no change needed.

## i18n

New user-facing strings (all wrapped in `t('English text')`):

- `'Step view'` — toggle button tooltip
- `'List view'` — toggle button tooltip
- Step titles reuse existing keys: `'Thinking'`, `'AI'`, `'Error'`, `'System'` (already defined in `thought-utils.ts` i18n extraction block)
- Tool call titles use raw `toolName` (not translated — tool names are proper nouns)

Run `npm run i18n` before commit.

## Testing

### Unit Tests

`tests/unit/renderer/thoughts-to-steps.test.ts` — covers the pure function. See "New Files" section for the full test case list.

Run: `npm run test:unit -- tests/unit/renderer/thoughts-to-steps.test.ts`

### Manual Verification

- Desktop + mobile (< 640px) visual check:
  - Default list mode identical to pre-change behavior
  - Toggle to step mode renders step cards correctly
  - Consecutive `thinking` merged into single step
  - `tool_call` step shows friendly subtitle, expandable to show input/output
  - `Task`/`Agent` step embeds `SubAgentTimeline` correctly
  - Streaming updates refresh steps in real time
  - Scroll behavior (auto-scroll, maximize toggle) works in both modes
- TypeScript compilation: no errors
- `npm run i18n`: no missing keys

## Validation Checklist

- [ ] `thoughts-to-steps.ts` unit tests pass
- [ ] `npm run i18n` clean
- [ ] TypeScript compiles
- [ ] List mode visually identical to pre-change
- [ ] Step mode renders correctly on desktop
- [ ] Step mode renders correctly on mobile (< 640px)
- [ ] Streaming updates work in step mode
- [ ] Sub-agent timeline embeds correctly in step mode
- [ ] View toggle persists during session (does not reset on every render)

## Phase 2 Preview (Not in Scope)

- Arrow connectors between step cards
- Timeline proportion bar showing per-step duration share
- Step view in `CollapsedThoughtProcess` (history messages)
- Performance optimization for 100+ thought conversations (if needed)
