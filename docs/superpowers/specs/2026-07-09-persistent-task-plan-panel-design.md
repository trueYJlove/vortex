# Persistent Task Plan Panel — Design

## Background

The task plan (TodoWrite) display currently lives in two places:

1. **ThoughtProcess panel** (inline in the chat stream) — renders `TodoCard` at the bottom of the thinking panel while the agent is active.
2. **ConversationList right sidebar** — renders `PersistentTaskPlanSection` in a `SidebarSection` that is **conditionally visible** only when `hasTodos` is true.

Problem: the sidebar section appears and disappears as TodoWrite is triggered or cleared, causing layout shift and giving no persistent anchor for the user.

## Goal

Make the task plan panel in the right sidebar **always present**:

- Empty state: show the panel title + a muted hint.
- Has-state: reuse the existing `PersistentTaskPlanSection` with full capability retention (progress bar, counts, activeForm substitution, interrupted state).
- Remove the task plan rendering from ThoughtProcess and CollapsedThoughtProcess entirely — the sidebar becomes the single UI surface for task plans.

## Non-Goals

- No new store, selector, or persistence layer. `useTodos()` remains the data source.
- No重构 of `TodoCard` or `PersistentTaskPlanSection`.
- No change to the data flow — todos remain derived from `thoughts`.
- No new unit tests (renderer-only change; project convention requires tests only for apps/platform).

## Architecture

### New Component

`src/renderer/components/chat/PersistentTaskPlanPanel.tsx`

Responsibilities:
- Mount permanently inside `ConversationList` (below the sessions list, same slot as the current conditional section).
- Read `useTodos()` and switch between two visual states:
  - **Empty**: title row (`ListTodo` icon + `t('Task plan')`) + `t('Task plan will appear here')` muted hint.
  - **Has todos**: embed `PersistentTaskPlanSection` in `embedded` mode — preserves progress bar, counts, `SidebarTodoRow`, `activeForm`, interrupted state.
- Local `useState(true)` for expand/collapse; default expanded so the panel is visibly present.
- Title row is clickable to toggle collapse in both empty and has-state.

### Unchanged

- `PersistentTaskPlanSection.tsx` — continues to render the has-state UI.
- `useTodos.ts` — data source unchanged.
- `TodoCard.tsx` — kept as the function source (`getLatestTodosFromThoughts`, `parseTodoInput`, `getTodoStats` may still be imported by other modules).
- `chat.store.ts` — no store changes.
- ThoughtProcess `displayThoughts` filter rule that excludes `toolName === 'TodoWrite'` — **kept**; only the TodoCard rendering is removed.

### Removed

- `ThoughtProcess.tsx`: `TodoCard` and `getLatestTodosFromThoughts` imports, `latestTodos` useMemo, the TodoCard render block.
- `CollapsedThoughtProcess.tsx`: same removals.

## Data Flow

```
ChatStore
  sessions: Map<conversationId, SessionState>
    SessionState.thoughts: Thought[]
  conversationCache: Map<conversationId, Conversation>
    Conversation.messages[].thoughts
         │
         ▼
  useTodos()  (unchanged)
    1. live: sessions.get(currentConvId).thoughts
    2. fallback: conversationCache messages[].thoughts (reverse)
    3. null if no TodoWrite thought
         │
         ▼
  PersistentTaskPlanPanel  (new)
    ├─ null or length === 0 → empty state
    └─ non-empty → PersistentTaskPlanSection(embedded)
```

No new selectors, no duplicated state, no changes to `useTodos`.

## UI & Interaction

### Layout

```
ConversationList (right sidebar)
  ├─ PulseSidebarSection       (top, unchanged)
  ├─ Sessions                  (middle, virtualized, flex-1)
  └─ PersistentTaskPlanPanel   (bottom, always mounted, replaces visible={hasTodos} section)
```

### Visual States

**Empty**:
- Title row: `ListTodo` icon + `t('Task plan')` + chevron.
- Body: `t('Task plan will appear here')` in `text-muted-foreground/60`.

**Has todos**:
- Title row: same.
- Body: `PersistentTaskPlanSection(embedded)` — progress bar, counts, `SidebarTodoRow` items, all existing capabilities.

### Interaction

| Action | Behavior |
|---|---|
| Click title row | Toggle collapse (both empty and has-state) |
| Collapsed | Only title row visible, body height 0 |
| Default | Expanded (`useState(true)`) |
| Empty → has todos | If not manually collapsed, body expands to show content |
| Has todos → empty | Switches to empty state, collapse state preserved |
| Conversation switch | Content auto-updates via `useTodos()`; collapse state does not reset |

### Styling

- Theme tokens only (`bg-card/30`, `text-muted-foreground`, `text-primary`, etc.). No hardcoded colors.
- Empty hint in `text-muted-foreground/60`.
- Mobile-first responsive: panel fills sidebar width at < 640px, no special handling.

## Change List

| File | Operation | Notes |
|---|---|---|
| `src/renderer/components/chat/PersistentTaskPlanPanel.tsx` | New | Always-mounted panel; empty/has-state switch; title collapse |
| `src/renderer/components/chat/ConversationList.tsx` | Modify | Remove `visible={hasTodos}`, mount `PersistentTaskPlanPanel`; drop inline `PersistentTaskPlanSection` reference |
| `src/renderer/components/chat/ThoughtProcess.tsx` | Modify | Remove `TodoCard` import, `getLatestTodosFromThoughts` import, `latestTodos` useMemo, TodoCard render block. Keep `displayThoughts` TodoWrite exclusion filter |
| `src/renderer/components/chat/CollapsedThoughtProcess.tsx` | Modify | Same removals as ThoughtProcess |
| `src/renderer/i18n/locales/*.json` (8 files) | Modify | New key `"Task plan will appear here"` |

## Verification

| Scenario | Expected |
|---|---|
| New conversation, no TodoWrite | Sidebar shows empty state hint |
| After TodoWrite triggered | Panel switches to progress bar + counts + list |
| Completed / in-progress / pending counts | Fully preserved |
| Interrupted state (agent inactive + in_progress) | Amber styling preserved |
| `activeForm` substitution for in_progress items | Preserved |
| Switch to conversation without todos | Panel reverts to empty state |
| Switch to conversation with todos | Panel updates accordingly |
| Collapse/expand title | Works in both empty and has-state |
| ThoughtProcess thinking panel | No longer renders TodoCard; other features intact |
| CollapsedThoughtProcess history | No longer renders TodoCard |
| Mobile < 640px | Panel fills sidebar, no overflow |

## Risks & Mitigations

- **`hasTodos` referenced elsewhere**: grep all usage sites before editing `ConversationList.tsx`; confirm only this one occurrence.
- **Dead `latestTodos` variable**: remove the `useMemo` and variable declaration together with the render block in `ThoughtProcess.tsx`.
- **i18n missing keys**: run `npm run i18n` after edits, verify all 8 locale files contain the new key.