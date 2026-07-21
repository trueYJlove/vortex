# 会话级模型选择器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 InputToolbar 左侧群组（深度思考按钮右侧）添加会话级模型选择器药丸，让用户能一目了然当前会话所用模型并独立切换。

**Architecture:** 新建 `ConversationModelPill` 自包含组件，通过 store hooks 读取当前会话模型 pin 和全局默认值；复用 `ModelSelector.tsx` 中的 `ModelList` 组件渲染下拉面板；桌面端展开内联下拉框，移动端弹出 `ModelSelectSheet`；`setConversationModel` 中从 `response.data` 刷新远端缓存。

**Tech Stack:** React + Zustand + Tailwind CSS + Lucide React

## Global Constraints

- 所有文本必须使用 `t('English text')` 国际化
- 遵循 `Conversation.modelSourceId` / `Conversation.modelId` 现有字段，不新增数据结构
- 模型选择只 pin 到当前会话，不改全局默认
- 遵循 InputToolbar 现有按钮样式体系（h-8, rounded-lg, 文本 xs）

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/renderer/components/chat/ConversationModelPill.tsx` | **CREATE** | 模型选择器药丸 + 桌面端下拉面板 |
| `src/renderer/components/layout/ModelSelector.tsx` | **MODIFY** | 导出 `ModelList` 供药丸复用 |
| `src/renderer/components/chat/InputArea.tsx` | **MODIFY** | InputToolbar 左侧群组添加药丸 |
| `src/renderer/stores/chat/conversations.ts` | **MODIFY** | `setConversationModel` 远端同步优化 |

---

### Task 1: 导出 ModelList + 创建 ConversationModelPill

**Files:**
- Modify: `src/renderer/components/layout/ModelSelector.tsx:54` — 将 `function ModelList` 改为 `export function ModelList`
- Create: `src/renderer/components/chat/ConversationModelPill.tsx`
- Modify: `src/renderer/components/chat/InputArea.tsx:819-960` — InputToolbar 中渲染药丸

**Interfaces:**
- Consumes: `ModelList` (exported from ModelSelector), `ModelSelectSheet` (already exported), `useCurrentConversation()` (internal to ModelSelector, needs extraction), `useAiSources()` (internal to ModelSelector, needs extraction), `getModelDisplayName` from types, `useIsMobile` from hooks
- Produces: `<ConversationModelPill />` — 无 props 自包含组件

#### Step 1: 导出 ModelList

在 `ModelSelector.tsx:54` 将：

```tsx
function ModelList({ onDone }: { onDone: () => void }) {
```

改为：

```tsx
export function ModelList({ onDone }: { onDone: () => void }) {
```

导出后 `ConversationModelPill` 和现有 `ModelSelector` / `ModelSelectSheet` 均可引用。

#### Step 2: 提取共享 hooks

`ModelSelector.tsx` 中有两个内部 hook（`useAiSources` 和 `useCurrentConversation`），`ConversationModelPill` 也需要它们。将它们提取到共享位置。

在 `ModelSelector.tsx` 中将两个 hook 改为 export：

```tsx
// line 29
export function useAiSources(): AISourcesConfig {
```

```tsx
// line 42
export function useCurrentConversation(): Conversation | null {
```

保留原位置不动，仅添加 `export` 关键字。

#### Step 3: 创建 ConversationModelPill 组件

创建 `src/renderer/components/chat/ConversationModelPill.tsx`：

```tsx
/**
 * ConversationModelPill - Session-level model selector pill in InputToolbar.
 *
 * Shows the current conversation's model (or global default fallback) as a
 * clickable pill. Desktop: opens an inline dropdown panel containing ModelList.
 * Mobile: opens ModelSelectSheet.
 * Self-contained — no props required.
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { useAppStore } from '../../stores/app.store'
import { useChatStore } from '../../stores/chat.store'
import { getModelDisplayName } from '../../types'
import { useTranslation } from '../../i18n'
import { useIsMobile } from '../../hooks/useIsMobile'
import { ModelList, ModelSelectSheet, useAiSources, useCurrentConversation } from '../layout/ModelSelector'

export function ConversationModelPill() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const aiSources = useAiSources()
  const currentConversation = useCurrentConversation()

  // Determine display: session pin → that model; otherwise global default.
  const hasPin = Boolean(currentConversation?.modelSourceId)
  const modelName = getModelDisplayName(
    aiSources,
    currentConversation?.modelSourceId,
    currentConversation?.modelId
  )

  // Close dropdown on outside click (desktop only)
  useEffect(() => {
    if (!isOpen || isMobile) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen, isMobile])

  // Escape key closes dropdown
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleToggle = () => setIsOpen(v => !v)
  const handleClose = () => setIsOpen(false)

  return (
    <div className="relative" ref={containerRef}>
      {/* Pill button */}
      <button
        onClick={handleToggle}
        className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg transition-colors duration-200 border ${
          isOpen
            ? 'border-primary/30 bg-primary/5 text-primary'
            : 'border-border text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50'
        }`}
        title={modelName}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
        <span className="text-xs max-w-[100px] truncate">{modelName}</span>
        {hasPin && (
          <span className="text-[9px] leading-none bg-primary/15 text-primary px-1 py-0.5 rounded">
            {t('Session')}
          </span>
        )}
        <ChevronDown
          size={12}
          className={`flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown / Sheet */}
      {isOpen && (
        isMobile ? (
          <ModelSelectSheet onClose={handleClose} />
        ) : (
          <div className="absolute left-0 bottom-full mb-2 w-64 bg-card border border-border rounded-xl shadow-lg z-50 py-1 max-h-[60vh] overflow-y-auto">
            <div className="px-3 py-2 border-b border-border/50">
              <p className="text-xs font-medium text-foreground">{modelName}</p>
              {hasPin && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t('Session-level model selection')}
                </p>
              )}
            </div>
            <ModelList onDone={handleClose} />
          </div>
        )
      )}
    </div>
  )
}
```

#### Step 4: 将药丸接入 InputToolbar

在 `InputArea.tsx` 中：

1. 顶部添加 import：
```tsx
import { ConversationModelPill } from './ConversationModelPill'
```

2. 在 InputToolbar 函数中，在深度思考按钮之后、左侧群组闭合标签之前添加药丸。找到这一段（约 line 900-915）：

```tsx
        {/* Thinking mode toggle - always show full label, no expansion */}
        {!isGenerating && !isOnboarding && (
          <button
            onClick={onThinkingToggle}
            ...
          >
            <Atom size={15} />
            <span className="text-xs">{t('Deep Thinking')}</span>
          </button>
        )}
      </div>
```

在深度思考按钮 `</button>` 之后、`</div>`（左侧群组闭合）之前添加：

```tsx
        {/* Session-level model selector pill */}
        {!isGenerating && !isOnboarding && <ConversationModelPill />}
```

**注意：** 生成期间隐藏模型选择器（用户不能切换模型），与深度思考按钮行为一致。

- [ ] **Step 1: 导出 ModelList**

```tsx
// ModelSelector.tsx line 54
export function ModelList({ onDone }: { onDone: () => void }) {
```

- [ ] **Step 2: 导出 useAiSources 和 useCurrentConversation**

```tsx
// ModelSelector.tsx line 29
export function useAiSources(): AISourcesConfig {

// ModelSelector.tsx line 42
export function useCurrentConversation(): Conversation | null {
```

- [ ] **Step 3: 创建 ConversationModelPill.tsx**

使用 Step 3 中的完整代码创建文件。

- [ ] **Step 4: 在 InputToolbar 中渲染药丸**

添加 import 和 JSX。

- [ ] **验证：启动 dev server，观察 InputToolbar 在深度思考按钮右侧出现模型药丸，点击展开下拉面板显示模型列表**

Run: `npm run dev`

---

### Task 2: 移动端适配

**Files:**
- Modify: `src/renderer/components/chat/ConversationModelPill.tsx`

**Interfaces:**
- Consumes: `useIsMobile()` from hooks, `ModelSelectSheet` from ModelSelector
- Produces: 移动端点击药丸弹出底部面板

**说明：** Task 1 中已包含移动端分支（`isMobile ? <ModelSelectSheet /> : <dropdown>`），本 Task 验证移动端行为并处理窄屏截断。

#### Step 1: 验证移动端逻辑

在 ConversationModelPill 中，`useIsMobile()` 基于 `window.innerWidth < 640px` 判定。当移动端时，点击药丸弹出 `ModelSelectSheet`（已有组件，含 backdrop、动画、Escape 关闭）。无需额外代码变更。

#### Step 2: 窄屏药丸截断

当前药丸中模型名使用 `max-w-[100px] truncate`。在极窄屏幕（< 360px）上，如果模型名过长 + Session 标签，可能溢出。验证以下样式：

- 药丸容器 `h-8 flex items-center gap-1.5 px-2.5` — 内部 flex 不换行
- 模型名 `text-xs max-w-[100px] truncate` — 截断优先
- Session 标签 `text-[9px] leading-none` — 最小尺寸，`shrink-0`（ChevronDown 也有 `flex-shrink-0`）

在 Chrome DevTools 中缩窄到 320px 验证布局不溢出。如果溢出，将 `max-w-[100px]` 调小至 `max-w-[80px]` 或使用 `max-w-[30vw]`。

- [ ] **Step 1: 在移动端 DevTools 中验证药丸布局**

打开 DevTools 移动端模拟（iPhone SE / 375px 宽度），点击药丸验证 ModelSelectSheet 正常弹出。

- [ ] **Step 2: 在 320px 宽度验证截断**

将视图缩窄到 320px，确认模型名正确截断、Session 标签完整显示。

---

### Task 3: 远端同步 — setConversationModel 使用 response.data

**Files:**
- Modify: `src/renderer/stores/chat/conversations.ts:527-546`

**Interfaces:**
- Consumes: `ApiResponse.data` 来自 `api.updateConversation()` — 所有传输层（IPC、HTTP）均已返回 `{ success: true, data: conversation }`
- Produces: 远端客户端在 setConversationModel 后即时刷新 conversationCache

**背景：** `updateConversation` 在 IPC handler（`src/main/ipc/conversation.ts:57`）和 HTTP controller（`src/main/controllers/conversation.controller.ts:75`）中均返回 `{ success: true, data: conversation }`（完整 Conversation 对象）。当前 `setConversationModel` 仅检查 `response.success` 后用本地构造的对象更新缓存。对于远端 HTTP 客户端，`response.data` 包含服务器返回的完整 conversation，使用它更新缓存更可靠。

#### Step 1: 修改 setConversationModel

当前代码（`conversations.ts:527-546`）：

```typescript
setConversationModel: async (spaceId, conversationId, modelSourceId, modelId) => {
    try {
      const response = await api.updateConversation(spaceId, conversationId, { modelSourceId, modelId })
      if (response.success) {
        set((state) => {
          const newCache = new Map(state.conversationCache)
          const cached = newCache.get(conversationId)
          if (cached) {
            newCache.set(conversationId, { ...cached, modelSourceId, modelId })
          }
          return { conversationCache: newCache }
        })
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to set conversation model:', error)
      return false
    }
  },
```

修改为优先使用 `response.data`（完整 conversation），fallback 到本地构造：

```typescript
  setConversationModel: async (spaceId, conversationId, modelSourceId, modelId) => {
    try {
      const response = await api.updateConversation(spaceId, conversationId, { modelSourceId, modelId })
      if (response.success) {
        set((state) => {
          const newCache = new Map(state.conversationCache)
          if (response.data && typeof response.data === 'object') {
            // Use the full conversation from the server response (HTTP remote mode)
            newCache.set(conversationId, response.data as Conversation)
          } else {
            // Electron IPC: fall back to local update
            const cached = newCache.get(conversationId)
            if (cached) {
              newCache.set(conversationId, { ...cached, modelSourceId, modelId })
            }
          }
          return { conversationCache: newCache }
        })
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to set conversation model:', error)
      return false
    }
  },
```

同时确保 `Conversation` 类型在文件顶部已 import。查看当前 conversations.ts 顶部，确认已有 `Conversation` 类型 import。（该文件为 `chat.store.ts` 的 `conversations` slice，通常在 `stores/chat/` 目录中。）

- [ ] **Step 1: 确认 Conversation 类型 import**

在 `conversations.ts` 顶部搜索 `import type { Conversation }`，确认已存在。

- [ ] **Step 2: 修改 setConversationModel**

应用上述代码变更。

- [ ] **Step 3: 编译验证**

Run: `npm run build`（或 `npx tsc --noEmit`）确认无类型错误。

---
