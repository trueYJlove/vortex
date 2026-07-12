# Agent Reasoning Visualization — Phase 1 Implementation Plan

> Spec: `docs/superpowers/specs/2026-07-11-agent-reasoning-visualization-phase1-design.md`

## Execution Order

Three sequential tasks. Each task is independently verifiable.

---

## Task 1: `thoughts-to-steps.ts` + Unit Tests

**Files:**

| Action | Path |
|--------|------|
| Create | `src/renderer/components/chat/thoughts-to-steps.ts` |
| Create | `tests/unit/renderer/thoughts-to-steps.test.ts` |

**`thoughts-to-steps.ts` content:**

1. Define types: `StepKind`, `StepStatus`, `FlowStep`
2. Implement `thoughtsToSteps(thoughts: Thought[]): FlowStep[]`
3. Import `Thought`, `TaskProgress` from `../../types`
4. Import `getToolFriendlyFormat` from `./thought-utils`

**Algorithm steps:**

- Filter: exclude `type === 'result'`, `type === 'tool_result'`, `toolName === 'TodoWrite'`, `parentToolUseId` non-empty
- Sequential traversal with type-based grouping:
  - Consecutive `thinking` → merge into one `thinking` step
  - Consecutive `text` → merge into one `text` step
  - `tool_use` → standalone `tool_call` step
  - `error` → standalone `error` step
  - `system` → standalone `system` step
  - No cross-type merging
- Status inference per step:
  - `streaming` — any thought has `isStreaming === true`
  - `running` — `tool_use` with `isReady === true` but no `toolResult`
  - `completed` — has `toolResult` with `!isError`, or non-tool step not streaming
  - `error` — has `toolResult` with `isError`, or `type === 'error'`
- Title generation:
  - `thinking` → `'Thinking'`
  - `text` → `'AI'`
  - `tool_call` → `toolName` (raw, not translated)
  - `error` → `'Error'`
  - `system` → `'System'`
- Subtitle: `tool_call` uses `getToolFriendlyFormat(toolName, toolInput)`, others omit
- `id`: `firstThought.id`
- `startTime`: `new Date(firstThought.timestamp).getTime()`
- `duration`: `lastThought.timestamp - firstThought.timestamp` (only if > 1 thought)
- Sub-agent: do not recurse; preserve `toolName` and `taskProgress` on the `FlowStep`

**Unit test cases (`thoughts-to-steps.test.ts`):**

```
describe('thoughtsToSteps')
  ✓ empty input → []
  ✓ single thinking → one thinking step
  ✓ single text → one text step
  ✓ single tool_use → one tool_call step
  ✓ single error → one error step
  ✓ single system → one system step
  ✓ consecutive thinking merged into one step
  ✓ consecutive text merged into one step
  ✓ thinking + tool_use → two separate steps (no cross-type merge)
  ✓ tool_use + thinking → two separate steps
  ✓ tool_use with toolResult.isError=false → status 'completed'
  ✓ tool_use with toolResult.isError=true → status 'error'
  ✓ tool_use with isStreaming=true → status 'streaming'
  ✓ tool_use with isReady=true, no toolResult → status 'running'
  ✓ type 'TodoWrite' filtered out
  ✓ type 'result' filtered out
  ✓ type 'tool_result' filtered out
  ✓ parentToolUseId non-empty filtered out
  ✓ duration calculated from first to last thought timestamp
  ✓ tool_call subtitle from getToolFriendlyFormat
  ✓ taskProgress preserved on tool_call step
```

**Verification:**

- `npm run test:unit -- tests/unit/renderer/thoughts-to-steps.test.ts` — all pass
- `npx tsc --noEmit` — no type errors

**No dependency on other tasks.** This is the foundation.

---

## Task 2: `StepCard.tsx` Component

**Files:**

| Action | Path |
|--------|------|
| Create | `src/renderer/components/chat/StepCard.tsx` |

**Depends on:** Task 1 (`thoughts-to-steps.ts` types)

**Component structure:**

```
StepCard
  ├─ Header row (click to expand/collapse)
  │   ├─ Icon (getThoughtIcon by step kind / toolName)
  │   ├─ Title (t() for Thinking/AI/Error/System, raw for toolName)
  │   ├─ Status label (t('Done') / t('Running') / t('Generating') / t('Hint'))
  │   ├─ Duration (hidden sm:inline, '(x.xs)' format)
  │   └─ Expand chevron
  ├─ Subtitle row (muted, only for tool_call)
  └─ Content area (collapsible)
      ├─ thinking: italic muted text, expand/collapse if > 150 chars
      ├─ tool_call:
      │   ├─ Raw JSON toggle (Braces icon)
      │   └─ ToolResultViewer (when toolResult exists)
      ├─ error: ErrorContent
      ├─ system: muted text
      └─ Task/Agent: SubAgentTimeline (embedded, allThoughts + isThinking passed through)
```

**Props:**

```typescript
interface StepCardProps {
  step: FlowStep
  allThoughts?: Thought[]
  isLast: boolean
  isThinking?: boolean
}
```

**State:**

- `isExpanded: boolean` — default: `step.status === 'streaming' || step.status === 'running'`
- `showRawJson: boolean` — default false
- `showResult: boolean` — default true
- `isContentExpanded: boolean` — default false (for thinking text expand)

**Reused utilities (import from existing):**

- `getThoughtIcon`, `getThoughtColor`, `getThoughtLabelKey` from `./thought-utils`
- `getToolFriendlyFormat` from `./thought-utils`
- `ToolResultViewer` from `./tool-result`
- `SubAgentTimeline` from `./SubAgentTimeline`
- `ErrorContent` from `./ErrorContent`
- `useTranslation` from `../../i18n`
- `truncateText` from `./thought-utils`

**Styling rules:**

- Theme tokens: `bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`, `text-primary`, `text-amber-500` (error/warning), `text-green-400` (success), `text-blue-400` (running)
- Card container: `rounded-lg border border-border/50 bg-card/30`
- Header: `flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30`
- Content area: `px-3 pb-2 border-t border-border/30`
- Mobile-first: header `flex-wrap` on mobile, timestamp `hidden sm:inline`
- `break-words` + `overflow-x-auto` for long content

**i18n keys used (already exist unless noted):**

- `t('Thinking')`, `t('AI')`, `t('Error')`, `t('System')` — existing
- `t('Done')`, `t('Running')`, `t('Generating')`, `t('Hint')` — existing
- `t('Collapse')`, `t('Expand')` — existing
- `t('Hide raw JSON')`, `t('Show raw JSON')` — existing
- `t('Hide')`, `t('Result')` — existing
- `t('Hide tool result')`, `t('Show tool result')` — existing

No new i18n keys needed for StepCard itself.

**Verification:**

- `npx tsc --noEmit` — no type errors
- Visual: cannot verify without integration (Task 3)

---

## Task 3: Integrate into `ThoughtProcess.tsx`

**Files:**

| Action | Path |
|--------|------|
| Modify | `src/renderer/components/chat/ThoughtProcess.tsx` |

**Depends on:** Task 1 + Task 2

**Changes (minimal, surgical):**

1. **New imports (top of file):**

```typescript
import { thoughtsToSteps, type FlowStep } from './thoughts-to-steps'
import { StepCard } from './StepCard'
// New icons for view toggle
import { List, GitBranch } from 'lucide-react'
```

2. **New state (inside `ThoughtProcess` component, after existing state):**

```typescript
const [viewMode, setViewMode] = useState<'list' | 'steps'>('list')
```

3. **New useMemo (after `displayThoughts`):**

```typescript
const steps = useMemo(() => thoughtsToSteps(displayThoughts), [displayThoughts])
```

4. **Header toggle UI (insert before the expand chevron, only when `isExpanded`):**

```tsx
{isExpanded && (
  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
    <button
      onClick={() => setViewMode('list')}
      className={`p-1 rounded transition-colors ${
        viewMode === 'list'
          ? 'text-primary bg-primary/10'
          : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50'
      }`}
      title={t('List view')}
    >
      <List size={14} />
    </button>
    <button
      onClick={() => setViewMode('steps')}
      className={`p-1 rounded transition-colors ${
        viewMode === 'steps'
          ? 'text-primary bg-primary/10'
          : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50'
      }`}
      title={t('Step view')}
    >
      <GitBranch size={14} />
    </button>
  </div>
)}
```

5. **Content area conditional render (replace the existing `displayThoughts.map(...)` block):**

```tsx
{hasDisplayContent && (
  <div
    ref={contentRef}
    onScroll={handleScroll}
    className={`px-4 pt-3 ${isMaximized ? 'max-h-[80vh]' : 'max-h-[300px]'} overflow-auto scrollbar-overlay transition-all duration-200`}
  >
    {viewMode === 'list' ? (
      displayThoughts.map((thought, index) => {
        // ... existing LazyThoughtItem rendering, unchanged
      })
    ) : (
      steps.map((step, index) => (
        <StepCard
          key={step.id}
          step={step}
          isLast={index === steps.length - 1 && !isThinking}
          allThoughts={step.toolName === 'Task' || step.toolName === 'Agent' ? thoughts : undefined}
          isThinking={step.toolName === 'Task' || step.toolName === 'Agent' ? isThinking : undefined}
        />
      ))
    )}
  </div>
)}
```

**Unchanged:**

- Header collapse/expand logic
- `hasAutoExpanded` logic
- `startTime` calculation
- `displayThoughts` filter logic
- Auto-scroll logic (`useSmartScroll`, `handleScroll`)
- Maximize toggle
- Auto-scroll pin button

**New i18n keys:**

- `t('List view')` — toggle tooltip
- `t('Step view')` — toggle tooltip

**Verification:**

- `npx tsc --noEmit` — no type errors
- `npm run i18n` — new keys extracted
- Visual check (desktop):
  - Default list mode identical to pre-change
  - Toggle to step mode renders step cards
  - Consecutive thinking merged into single step card
  - tool_call step shows friendly subtitle, expandable
  - Task/Agent step embeds SubAgentTimeline
  - Streaming updates refresh step cards
  - Scroll behavior works in both modes
  - Maximize toggle works in both modes
- Visual check (mobile < 640px):
  - Toggle buttons render correctly
  - Step cards responsive
  - Timestamps hidden on mobile

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `thoughtsToSteps` merge logic edge case | Medium | Comprehensive unit tests in Task 1 |
| `StepCard` styling inconsistency with existing theme | Low | Reuse existing color tokens, visual check in Task 3 |
| View toggle state reset on re-render | Low | `useState` is stable across renders; verify in Task 3 |
| Performance regression in step mode | Low | `useMemo` pattern matches existing; verify with long conversation |
| `SubAgentTimeline` embed breaks in StepCard | Medium | Pass `allThoughts` + `isThinking` through; verify in Task 3 |

## Rollback

All changes are additive except the `ThoughtProcess.tsx` modification. Rollback order:

1. Revert `ThoughtProcess.tsx` — restores list-only mode
2. Delete `StepCard.tsx`
3. Delete `thoughts-to-steps.ts` + test file

No data migration, no IPC changes, no store changes — rollback is clean.
