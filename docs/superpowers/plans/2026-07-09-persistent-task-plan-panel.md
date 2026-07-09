# Persistent Task Plan Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the task plan section in the right sidebar always present (empty state when no todos), and remove TodoCard rendering from ThoughtProcess/CollapsedThoughtProcess entirely.

**Architecture:** Create a new `PersistentTaskPlanPanel` component that wraps `PersistentTaskPlanSection` with an empty state and collapse toggle. Mount it permanently in `ConversationList` replacing the conditional `visible={hasTodos}` section. Remove TodoCard imports and rendering from the two thought process components.

**Tech Stack:** React 18, TypeScript, Zustand selectors, TailwindCSS theme tokens, Halo i18n (`t('English text')`).

---

## File Structure

| File | Operation | Responsibility |
|---|---|---|
| `src/renderer/components/chat/PersistentTaskPlanPanel.tsx` | **Create** | Always-mounted panel: empty state + has-state toggle, title row with collapse |
| `src/renderer/components/chat/ConversationList.tsx` | **Modify** (lines 23, 25, 64-65, 421-430) | Remove `PersistentTaskPlanSection` import, `useTodos`/`hasTodos`, `visible={hasTodos}` gate; mount `PersistentTaskPlanPanel` |
| `src/renderer/components/chat/ThoughtProcess.tsx` | **Modify** (lines 19, 400, 546, 571-575) | Remove `TodoCard`/`getLatestTodosFromThoughts` imports, `latestTodos` useMemo, `TodoCard` render block; update `isLast` logic |
| `src/renderer/components/chat/CollapsedThoughtProcess.tsx` | **Modify** (lines 18, 207, 221, 296-300) | Remove `TodoCard`/`getLatestTodosFromThoughts` imports, `latestTodos` useMemo, `TodoCard` render block; update `hasContent` logic |
| `src/renderer/i18n/locales/en.json` | **Modify** | Add `"Task plan will appear here"` key |
| `src/renderer/i18n/locales/zh-CN.json` | **Modify** | Add `"Task plan will appear here"` key |
| `src/renderer/i18n/locales/zh-TW.json` | **Modify** | Add `"Task plan will appear here"` key |
| `src/renderer/i18n/locales/ja.json` | **Modify** | Add `"Task plan will appear here"` key |
| `src/renderer/i18n/locales/ko.json` | **Modify** | Add `"Task plan will appear here"` key (if exists) |
| `src/renderer/i18n/locales/de.json` | **Modify** | Add `"Task plan will appear here"` key |
| `src/renderer/i18n/locales/fr.json` | **Modify** | Add `"Task plan will appear here"` key |
| `src/renderer/i18n/locales/es.json` | **Modify** | Add `"Task plan will appear here"` key |

---

### Task 1: Create PersistentTaskPlanPanel Component

**Files:**
- Create: `src/renderer/components/chat/PersistentTaskPlanPanel.tsx`

- [ ] **Step 1: Create the component file**

```tsx
/**
 * PersistentTaskPlanPanel - Always-mounted task plan panel in the right sidebar.
 * Shows empty state when no todos, full task plan when todos exist.
 */

import { useState } from 'react'
import { ListTodo, ChevronDown } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useTodos } from '../../hooks/useTodos'
import { PersistentTaskPlanSection } from './PersistentTaskPlanSection'

export function PersistentTaskPlanPanel() {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(true)
  const todos = useTodos()
  const hasTodos = todos !== null && todos.length > 0

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors"
      >
        <span className="text-muted-foreground">
          <ListTodo size={14} />
        </span>
        <span className="text-sm sm:text-[14px] font-medium text-muted-foreground flex-1 text-left">
          {t('Task plan')}
        </span>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`}
        />
      </button>
      {isExpanded && (
        <div>
          {hasTodos ? (
            <PersistentTaskPlanSection embedded />
          ) : (
            <div className="px-3 pb-3">
              <p className="text-xs text-muted-foreground/60">
                {t('Task plan will appear here')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the component builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors (or only pre-existing errors unrelated to this file)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/chat/PersistentTaskPlanPanel.tsx
git commit -m "feat: 添加常驻任务计划面板组件，支持空状态和折叠展开"
```

---

### Task 2: Mount PersistentTaskPlanPanel in ConversationList

**Files:**
- Modify: `src/renderer/components/chat/ConversationList.tsx`

- [ ] **Step 1: Remove old imports and state**

Remove `PersistentTaskPlanSection` import (line 23), `useTodos` import (line 25), and `todos`/`hasTodos` state (lines 64-65).

```tsx
// REMOVE these lines:
import { PersistentTaskPlanSection } from './PersistentTaskPlanSection'
import { useTodos } from '../../hooks/useTodos'

// Inside the component, REMOVE:
const todos = useTodos()
const hasTodos = todos !== null && todos.length > 0
```

- [ ] **Step 2: Add PersistentTaskPlanPanel import**

Add the new import at the top of the file:

```tsx
import { PersistentTaskPlanPanel } from './PersistentTaskPlanPanel'
```

- [ ] **Step 3: Replace the conditional SidebarSection with PersistentTaskPlanPanel**

Replace lines 421-430 (the `SidebarSection` with `visible={hasTodos}`):

```tsx
// BEFORE (lines 421-430):
<SidebarSection
  title={t('Task plan')}
  icon={<ListTodo size={14} />}
  defaultExpanded={false}
  className={sessionsExpanded ? 'mt-auto' : ''}
  visible={hasTodos}
>
  <PersistentTaskPlanSection embedded />
</SidebarSection>

// AFTER:
<PersistentTaskPlanPanel />
```

Note: The `mt-auto` class was used to push the section to the bottom when Sessions is expanded. The new panel should inherit this behavior. Add `className={sessionsExpanded ? 'mt-auto' : ''}` to `PersistentTaskPlanPanel` if needed, or handle it at the mount point:

```tsx
<div className={sessionsExpanded ? 'mt-auto' : ''}>
  <PersistentTaskPlanPanel />
</div>
```

- [ ] **Step 4: Verify no remaining references to removed imports**

Run: `grep -n "PersistentTaskPlanSection\|useTodos\|hasTodos" src/renderer/components/chat/ConversationList.tsx`
Expected: No matches (only `PersistentTaskPlanPanel` should appear)

- [ ] **Step 5: Verify the component builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to ConversationList

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/chat/ConversationList.tsx
git commit -m "refactor: 右侧栏任务计划改为常驻面板，移除条件可见性控制"
```

---

### Task 3: Remove TodoCard from ThoughtProcess

**Files:**
- Modify: `src/renderer/components/chat/ThoughtProcess.tsx`

- [ ] **Step 1: Remove TodoCard imports**

Remove line 19:

```tsx
// REMOVE:
import { TodoCard, getLatestTodosFromThoughts } from '../tool/TodoCard'
```

- [ ] **Step 2: Remove latestTodos useMemo**

Remove line 400:

```tsx
// REMOVE:
const latestTodos = useMemo(() => getLatestTodosFromThoughts(thoughts), [thoughts])
```

- [ ] **Step 3: Update isLast logic in displayThoughts map**

In the `displayThoughts.map` callback (around line 546), the `isLast` computation references `latestTodos`. Update it to remove that dependency:

```tsx
// BEFORE (line 546):
const isLast = index === displayThoughts.length - 1 && !latestTodos && !isThinking

// AFTER:
const isLast = index === displayThoughts.length - 1 && !isThinking
```

- [ ] **Step 4: Remove TodoCard render block**

Remove lines 570-575:

```tsx
// REMOVE:
{/* TodoCard - fixed at bottom, only one instance */}
{latestTodos && latestTodos.length > 0 && (
  <div className={`px-4 ${hasDisplayContent ? 'pt-2' : 'pt-3'} pb-3`}>
    <TodoCard todos={latestTodos} isAgentActive={isThinking} />
  </div>
)}
```

- [ ] **Step 5: Verify no remaining references**

Run: `grep -n "TodoCard\|latestTodos\|getLatestTodosFromThoughts" src/renderer/components/chat/ThoughtProcess.tsx`
Expected: No matches

- [ ] **Step 6: Verify the component builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to ThoughtProcess

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/chat/ThoughtProcess.tsx
git commit -m "refactor: 从 ThoughtProcess 中移除 TodoCard 渲染，任务计划统一由侧栏面板展示"
```

---

### Task 4: Remove TodoCard from CollapsedThoughtProcess

**Files:**
- Modify: `src/renderer/components/chat/CollapsedThoughtProcess.tsx`

- [ ] **Step 1: Remove TodoCard imports**

Remove line 18:

```tsx
// REMOVE:
import { TodoCard, getLatestTodosFromThoughts } from '../tool/TodoCard'
```

- [ ] **Step 2: Remove latestTodos useMemo**

Remove line 207:

```tsx
// REMOVE:
const latestTodos = useMemo(() => getLatestTodosFromThoughts(thoughts), [thoughts])
```

- [ ] **Step 3: Update hasContent logic**

Line 221 references `latestTodos`. Update to remove the dependency:

```tsx
// BEFORE (line 221):
const hasContent = displayThoughts.length > 0 || (latestTodos && latestTodos.length > 0)

// AFTER:
const hasContent = displayThoughts.length > 0
```

- [ ] **Step 4: Remove TodoCard render block**

Remove lines 295-300:

```tsx
// REMOVE:
{/* TodoCard at bottom - only one instance */}
{latestTodos && latestTodos.length > 0 && (
  <div className={`px-3 ${displayThoughts.length > 0 ? 'mt-2 pt-2 border-t border-border/20' : ''}`}>
    <TodoCard todos={latestTodos} isAgentActive={false} />
  </div>
)}
```

- [ ] **Step 5: Verify no remaining references**

Run: `grep -n "TodoCard\|latestTodos\|getLatestTodosFromThoughts" src/renderer/components/chat/CollapsedThoughtProcess.tsx`
Expected: No matches

- [ ] **Step 6: Verify the component builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to CollapsedThoughtProcess

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/chat/CollapsedThoughtProcess.tsx
git commit -m "refactor: 从 CollapsedThoughtProcess 中移除 TodoCard 渲染"
```

---

### Task 5: Add i18n Keys

**Files:**
- Modify: `src/renderer/i18n/locales/en.json`
- Modify: `src/renderer/i18n/locales/zh-CN.json`
- Modify: `src/renderer/i18n/locales/zh-TW.json`
- Modify: `src/renderer/i18n/locales/ja.json`
- Modify: `src/renderer/i18n/locales/de.json`
- Modify: `src/renderer/i18n/locales/fr.json`
- Modify: `src/renderer/i18n/locales/es.json`

- [ ] **Step 1: Add translation key to each locale file**

Add the following key-value pairs:

| File | Key | Value |
|---|---|---|
| `en.json` | `"Task plan will appear here"` | `"Task plan will appear here"` |
| `zh-CN.json` | `"Task plan will appear here"` | `"任务计划将在此处显示"` |
| `zh-TW.json` | `"Task plan will appear here"` | `"任務計劃將在此處顯示"` |
| `ja.json` | `"Task plan will appear here"` | `"タスクプランはここに表示されます"` |
| `de.json` | `"Task plan will appear here"` | `"Der Aufgabenplan wird hier angezeigt"` |
| `fr.json` | `"Task plan will appear here"` | `"Le plan de tâches apparaîtra ici"` |
| `es.json` | `"Task plan will appear here"` | `"El plan de tareas aparecerá aquí"` |

- [ ] **Step 2: Run automated i18n to sync**

Run: `npm run i18n`
Expected: Completes without errors; all locale files updated

- [ ] **Step 3: Commit**

```bash
git add src/renderer/i18n/locales/*.json
git commit -m "i18n: 添加'任务计划将在此处显示'多语言翻译键"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Full TypeScript build check**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 2: Visual verification checklist**

Verify the following scenarios manually:

| Scenario | Expected |
|---|---|
| New conversation, no TodoWrite | Sidebar shows empty state: "Task plan will appear here" |
| After TodoWrite triggered | Panel switches to progress bar + counts + list |
| Completed / in-progress / pending counts | Fully preserved |
| Interrupted state (agent inactive + in_progress) | Amber styling preserved |
| `activeForm` substitution for in_progress items | Preserved |
| Switch to conversation without todos | Panel reverts to empty state |
| Switch to conversation with todos | Panel updates accordingly |
| Collapse/expand title click | Works in both empty and has-state |
| ThoughtProcess thinking panel | No longer renders TodoCard |
| CollapsedThoughtProcess history | No longer renders TodoCard |
| Mobile < 640px | Panel fills sidebar, no overflow |

- [ ] **Step 3: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: 修复持久化任务计划面板的视觉问题"
```

---

## Summary

| Task | Files Changed | Description |
|---|---|---|
| 1 | 1 new | Create `PersistentTaskPlanPanel.tsx` |
| 2 | 1 modified | Mount panel in `ConversationList.tsx`, remove conditional gate |
| 3 | 1 modified | Remove TodoCard from `ThoughtProcess.tsx` |
| 4 | 1 modified | Remove TodoCard from `CollapsedThoughtProcess.tsx` |
| 5 | 7 modified | Add i18n translation keys |
| 6 | 0 | Final verification |
