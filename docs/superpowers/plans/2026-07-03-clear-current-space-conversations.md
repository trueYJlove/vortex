# 清除当前空间会话实现方案

> **给自动化工作者：** 必须使用子技能：superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本方案。步骤使用复选框（`- [ ]`）语法进行追踪。

**目标：** 添加一个经过强确认的操作，清除当前空间中的所有会话，然后创建一个全新的空会话。

**架构：** 复用现有的会话删除和创建 store/API 流程，避免新的 IPC 或 HTTP 契约。`ConversationList` 负责 UI 提示和确认对话框，而 `chat` store 负责批量状态转换，确保缓存、会话、脉冲状态和选中的会话保持一致。所有用户可见字符串使用 `t('English text')`。

**技术栈：** React 18、TypeScript、Zustand、现有 `useConfirmDialog`、现有会话 API、Vitest、electron-vite 构建。

---

## 文件结构

- 修改 `src/renderer/stores/chat/internal.ts`
  - 在 `ChatState` 中添加 `clearConversations(spaceId: string): Promise<boolean>`。

- 修改 `src/renderer/stores/chat/conversations.ts`
  - 扩展 slice 键联合类型以包含 `clearConversations`。
  - 通过现有的 `api.deleteConversation` 调用实现批量清除。
  - 从会话缓存、会话、未见完成和脉冲读取状态中移除已清除的 ID。
  - 清除成功后通过现有的 `createConversation` 操作创建新会话。

- 修改 `src/renderer/components/chat/ConversationList.tsx`
  - 添加头部菜单按钮。
  - 添加 `Clear conversations` 操作。
  - 使用 `useConfirmDialog` 进行危险确认。
  - 仅在确认后调用 `useChatStore.getState().clearConversations(spaceId)`。
  - 渲染对话框组件。

- 创建 `tests/unit/renderer/chat-clear-conversations.test.ts`
  - Mock 渲染器 API。
  - 验证清除删除了当前空间的每个会话，包括置顶会话。
  - 验证清除后创建并选择了新会话。
  - 验证相关的缓存/会话/脉冲状态被清理。

- 修改 `tests/unit/renderer/desktop-sidebar-position-swap.test.ts`
  - 为头部清除操作和确认文本添加源级检查。

---

### 任务 1：添加失败的 store 行为测试

**文件：**
- 创建：`tests/unit/renderer/chat-clear-conversations.test.ts`

- [ ] **步骤 1：Mock 渲染器 API 并导入 store**

使用测试级 API mock：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = {
  deleteConversation: vi.fn(),
  createConversation: vi.fn(),
  ensureSessionWarm: vi.fn(async () => ({ success: true })),
}

vi.mock('../../../src/renderer/api', () => ({ api: apiMock }))
```

- [ ] **步骤 2：编写失败测试**

测试期望行为：

```ts
it('clears all conversations in a space and creates a fresh selected conversation', async () => {
  const { useChatStore } = await import('../../../src/renderer/stores/chat.store')

  apiMock.deleteConversation.mockResolvedValue({ success: true })
  apiMock.createConversation.mockResolvedValue({
    success: true,
    data: {
      id: 'fresh-conversation',
      spaceId: 'space-1',
      title: 'New Conversation',
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-03T00:00:00.000Z',
      messages: [],
    },
  })

  useChatStore.setState({
    currentSpaceId: 'space-1',
    spaceStates: new Map([
      ['space-1', {
        currentConversationId: 'conversation-1',
        conversations: [
          { id: 'conversation-1', spaceId: 'space-1', title: 'One', createdAt: 'a', updatedAt: 'a', messageCount: 1, starred: true },
          { id: 'conversation-2', spaceId: 'space-1', title: 'Two', createdAt: 'b', updatedAt: 'b', messageCount: 2 },
        ],
      }],
    ]),
    conversationCache: new Map([
      ['conversation-1', { id: 'conversation-1' } as any],
      ['conversation-2', { id: 'conversation-2' } as any],
    ]),
    sessions: new Map([
      ['conversation-1', { isGenerating: false } as any],
      ['conversation-2', { isGenerating: false } as any],
    ]),
    unseenCompletions: new Map([['conversation-1', { spaceId: 'space-1', title: 'One' }]]),
    pulseReadAt: new Map([['conversation-2', { readAt: 1, originalStatus: 'error', spaceId: 'space-1', title: 'Two' }]]),
  } as any)

  const result = await useChatStore.getState().clearConversations('space-1')

  expect(result).toBe(true)
  expect(apiMock.deleteConversation).toHaveBeenCalledWith('space-1', 'conversation-1')
  expect(apiMock.deleteConversation).toHaveBeenCalledWith('space-1', 'conversation-2')
  expect(apiMock.createConversation).toHaveBeenCalledWith('space-1')
  expect(useChatStore.getState().spaceStates.get('space-1')?.conversations.map(c => c.id)).toEqual(['fresh-conversation'])
  expect(useChatStore.getState().spaceStates.get('space-1')?.currentConversationId).toBe('fresh-conversation')
  expect(useChatStore.getState().conversationCache.has('conversation-1')).toBe(false)
  expect(useChatStore.getState().sessions.has('conversation-1')).toBe(false)
  expect(useChatStore.getState().unseenCompletions.has('conversation-1')).toBe(false)
  expect(useChatStore.getState().pulseReadAt.has('conversation-2')).toBe(false)
})
```

- [ ] **步骤 3：运行测试验证失败**

运行：

```bash
npm run test:unit -- tests/unit/renderer/chat-clear-conversations.test.ts
```

预期：失败，因为 `clearConversations` 未定义。

---

### 任务 2：实现 store 的 clearConversations

**文件：**
- 修改：`src/renderer/stores/chat/internal.ts`
- 修改：`src/renderer/stores/chat/conversations.ts`

- [ ] **步骤 1：添加操作类型**

在 `ChatState` 中添加：

```ts
clearConversations: (spaceId: string) => Promise<boolean>
```

- [ ] **步骤 2：将 `clearConversations` 添加到 conversations slice 键联合类型**

修改 `ChatSlice<...>` 联合类型以包含 `'clearConversations'`。

- [ ] **步骤 3：实现 clearConversations**

添加一个 store 操作，执行以下步骤：

1. 读取目标空间的当前会话。
2. 对每个当前空间会话调用 `api.deleteConversation(spaceId, conversation.id)`。
3. 如果任何删除失败，返回 `false` 且不创建替换会话。
4. 从 `sessions`、`conversationCache`、`unseenCompletions` 和 `pulseReadAt` 中移除已删除的 ID。
5. 清空目标空间列表和选中的 ID。
6. 调用现有的 `createConversation(spaceId)` 操作创建并选择一个新会话。
7. 仅在替换会话创建成功时返回 `true`。

---

### 任务 3：添加带强确认的清除操作 UI

**文件：**
- 修改：`src/renderer/components/chat/ConversationList.tsx`

- [ ] **步骤 1：导入确认钩子**

添加：

```ts
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
```

- [ ] **步骤 2：初始化钩子**

在组件内部：

```ts
const { showConfirm, DialogComponent } = useConfirmDialog()
```

- [ ] **步骤 3：添加头部菜单状态**

添加：

```ts
const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
const headerMenuRef = useRef<HTMLDivElement>(null)
```

- [ ] **步骤 4：在外部点击时关闭头部菜单**

添加一个效果，在点击 `headerMenuRef` 外部时关闭 `headerMenuOpen`。

- [ ] **步骤 5：添加清除处理程序**

添加：

```ts
const handleClearConversations = async () => {
  setHeaderMenuOpen(false)
  const confirmed = await showConfirm({
    title: t('Clear all conversations?'),
    message: t('This will delete all conversations in the current space, including pinned conversations. This cannot be undone.'),
    confirmLabel: t('Clear'),
    cancelLabel: t('Cancel'),
    variant: 'danger',
  })
  if (!confirmed) return

  const spaceId = useSpaceStore.getState().currentSpace?.id
  if (spaceId) {
    await useChatStore.getState().clearConversations(spaceId)
  }
}
```

- [ ] **步骤 6：添加头部菜单按钮**

在头部中，靠近关闭按钮放置菜单触发器：

```tsx
<div ref={headerMenuRef} className="relative flex items-center gap-1">
  <button
    onClick={() => setHeaderMenuOpen(value => !value)}
    className="relative p-1 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground before:content-[''] before:absolute before:-inset-2"
    title={t('More')}
  >
    <EllipsisVertical className="w-4 h-4" />
  </button>
  {headerMenuOpen && (
    <div className="absolute right-0 top-full mt-1 z-[9999] min-w-[180px] bg-popover border border-border rounded-lg shadow-lg py-1">
      <button
        onClick={handleClearConversations}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>{t('Clear conversations')}</span>
      </button>
    </div>
  )}
</div>
```

- [ ] **步骤 7：渲染确认对话框**

在返回的片段中包含：

```tsx
{DialogComponent}
```

---

### 任务 4：验证

**文件：**
- 所有已更改的文件。

- [ ] **步骤 1：运行聚焦测试**

运行：

```bash
npm run test:unit -- tests/unit/renderer/chat-clear-conversations.test.ts tests/unit/renderer/desktop-sidebar-position-swap.test.ts
```

预期：所有测试通过。

- [ ] **步骤 2：运行构建**

运行：

```bash
npm run build
```

预期：退出码 0。

- [ ] **步骤 3：运行 i18n**

运行：

```bash
npm run i18n
```

预期：i18n 提取运行；如果 `.env.local` 缺失，翻译可能失败。报告确切结果。

---

## 自检

- 规范覆盖：方案涵盖了清除当前空间的所有会话（包括置顶会话）、强确认、新空会话创建、UI 放置、状态清理和验证。
- 占位符扫描：没有剩余的占位符或模糊的实现步骤。
- 类型一致性：store 操作在类型、实现、UI 和测试中一致命名为 `clearConversations(spaceId)`。
