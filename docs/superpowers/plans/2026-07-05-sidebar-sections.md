# 右侧边栏分区重组实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将右侧边栏拆分为"会话"和"任务计划"两个独立可折叠分区，固定项始终置顶。

**Architecture:** 新增 `SidebarSection` 通用折叠容器和 `PinnedItem` 固定项组件，重构 `ConversationList` 使用这两个组件包装内容，简化 `PersistentTaskPlanSection` 移除其内部折叠逻辑。

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide React icons, i18n (t() function)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/renderer/components/layout/SidebarSection.tsx` | 通用可折叠分区容器 |
| Create | `src/renderer/components/chat/PinnedItem.tsx` | 固定项组件（始终置顶） |
| Modify | `src/renderer/components/chat/ConversationList.tsx` | 使用 SidebarSection 重构布局 |
| Modify | `src/renderer/components/chat/PersistentTaskPlanSection.tsx` | 移除折叠逻辑，保留内容渲染 |
| Modify | `src/renderer/i18n/locales/en.json` | 新增 "Sessions" 翻译键 |
| Modify | `src/renderer/i18n/locales/zh-CN.json` | 新增 "Sessions" 翻译键 |

---

### Task 1: 创建 SidebarSection 通用折叠容器

**Files:**
- Create: `src/renderer/components/layout/SidebarSection.tsx`

- [ ] **Step 1: 创建 SidebarSection 组件**

```tsx
// src/renderer/components/layout/SidebarSection.tsx
import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface SidebarSectionProps {
  title: string
  icon?: ReactNode
  defaultExpanded?: boolean
  badge?: ReactNode
  actions?: ReactNode
  children: ReactNode
}

export function SidebarSection({
  title,
  icon,
  defaultExpanded = true,
  badge,
  actions,
  children,
}: SidebarSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors"
      >
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span className="text-sm sm:text-[14px] font-medium text-muted-foreground flex-1 text-left">
          {title}
        </span>
        {badge && <span className="text-xs text-muted-foreground">{badge}</span>}
        {actions && <span onClick={(e) => e.stopPropagation()}>{actions}</span>}
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
      </button>
      {expanded && <div>{children}</div>}
    </div>
  )
}
```

- [ ] **Step 2: 验证组件可导入**

运行: `npx electron-vite build 2>&1 | tail -5`
预期: 构建成功，无类型错误

- [ ] **Step 3: 提交**

```bash
git add src/renderer/components/layout/SidebarSection.tsx
git commit -m "feat: 添加 SidebarSection 通用折叠分区容器"
```

---

### Task 2: 创建 PinnedItem 固定项组件

**Files:**
- Create: `src/renderer/components/chat/PinnedItem.tsx`

- [ ] **Step 1: 创建 PinnedItem 组件**

```tsx
// src/renderer/components/chat/PinnedItem.tsx
import { MessageSquare } from 'lucide-react'
import { TaskStatusDot } from '../pulse/TaskStatusDot'

interface PinnedItemData {
  id: string
  title: string
  status?: 'active' | 'completed' | 'failed'
}

interface PinnedItemProps {
  item: PinnedItemData
  isSelected: boolean
  onClick: () => void
}

export function PinnedItem({ item, isSelected, onClick }: PinnedItemProps) {
  return (
    <div
      onClick={onClick}
      className={`w-full px-3 py-2 text-left hover:bg-secondary/50 transition-colors cursor-pointer flex items-center gap-2 ${
        isSelected ? 'bg-primary/10 border-l-2 border-primary' : ''
      }`}
    >
      <MessageSquare size={14} className="text-primary shrink-0" />
      <span className="flex-1 truncate text-sm">{item.title}</span>
      {item.status && (
        <TaskStatusDot status={item.status} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 验证组件可导入**

运行: `npx electron-vite build 2>&1 | tail -5`
预期: 构建成功

- [ ] **Step 3: 提交**

```bash
git add src/renderer/components/chat/PinnedItem.tsx
git commit -m "feat: 添加 PinnedItem 固定项组件"
```

---

### Task 3: 添加 i18n 翻译键

**Files:**
- Modify: `src/renderer/i18n/locales/en.json`
- Modify: `src/renderer/i18n/locales/zh-CN.json`

- [ ] **Step 1: 在 en.json 添加 "Sessions" 翻译键**

找到 `"Sessions"` 或在字母顺序正确的位置添加（大约在 `"Session"` 附近）：

```json
"Sessions": "Sessions",
```

- [ ] **Step 2: 在 zh-CN.json 添加 "Sessions" 翻译键**

找到对应位置添加：

```json
"Sessions": "会话",
```

- [ ] **Step 3: 提交**

```bash
git add src/renderer/i18n/locales/en.json src/renderer/i18n/locales/zh-CN.json
git commit -m "i18n: 添加 Sessions 翻译键"
```

---

### Task 4: 简化 PersistentTaskPlanSection 移除折叠逻辑

**Files:**
- Modify: `src/renderer/components/chat/PersistentTaskPlanSection.tsx`

- [ ] **Step 1: 读取当前文件了解完整结构**

读取 `src/renderer/components/chat/PersistentTaskPlanSection.tsx` 全文。

- [ ] **Step 2: 移除 collapsed state 和折叠按钮**

修改 PersistentTaskPlanSection，移除以下内容：
1. `const [collapsed, setCollapsed] = useState(false)` 状态声明
2. 头部按钮的 `onClick={() => setCollapsed(value => !value)}` 事件
3. ChevronDown 图标及其条件渲染逻辑
4. 内容区域的 `!collapsed &&` 条件判断

保留：
- 数据获取逻辑（useChatStore selector）
- 头部标题和统计信息
- 进度条渲染
- Todo 列表渲染
- 外层 `border-b border-border bg-card/40 flex-shrink-0` 样式

修改后的组件结构应为：

```tsx
// 简化后的关键部分
export function PersistentTaskPlanSection() {
  // ... 数据获取逻辑保持不变 ...

  // 移除 collapsed state

  // 无 todos 时不渲染（保持原有逻辑）
  if (!hasTodos && !stats) {
    return null
  }

  return (
    <div className="border-b border-border bg-card/40 flex-shrink-0">
      {/* 头部：只保留标题和统计，移除折叠按钮 */}
      <div className="flex items-center gap-2 px-3 py-2">
        <ListTodo size={14} className="text-primary" />
        <span className="text-sm font-medium">{t('Task plan')}</span>
        {stats && (
          <span className="text-xs text-muted-foreground ml-auto">
            {stats.completed}/{stats.total}
          </span>
        )}
      </div>

      {/* 内容：移除 collapsed 条件 */}
      {hasTodos && stats && (
        <>
          {/* 进度条 */}
          <div className="px-3 pb-2">
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${stats.progress}%` }}
              />
            </div>
          </div>
          {/* Todo 列表 */}
          <div className="max-h-48 overflow-y-auto px-3 pb-2">
            {todos.map((todo) => (
              <SidebarTodoRow key={todo.id} todo={todo} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 验证构建**

运行: `npx electron-vite build 2>&1 | tail -5`
预期: 构建成功

- [ ] **Step 4: 提交**

```bash
git add src/renderer/components/chat/PersistentTaskPlanSection.tsx
git commit -m "refactor: 简化 PersistentTaskPlanSection 移除折叠逻辑"
```

---

### Task 5: 重构 ConversationList 使用 SidebarSection

**Files:**
- Modify: `src/renderer/components/chat/ConversationList.tsx`

- [ ] **Step 1: 读取当前文件了解完整结构**

读取 `src/renderer/components/chat/ConversationList.tsx` 全文，重点关注：
- Header 区域 (L406-439)
- PersistentTaskPlanSection 集成 (L441)
- Top Section (L443-458)
- 会话列表 (L461-467)
- 新对话按钮 (L470-481)

- [ ] **Step 2: 添加新的 import**

在文件顶部添加：

```tsx
import { SidebarSection } from '../layout/SidebarSection'
import { PinnedItem } from './PinnedItem'
import { MessageSquare } from 'lucide-react'
```

- [ ] **Step 3: 重构渲染结构**

将当前的渲染结构从：

```
Header
PersistentTaskPlanSection
Top Section (AutomationBadge + PulseSidebarSection)
Conversation List (Virtuoso)
New Conversation Button
```

改为：

```
Header
SidebarSection "会话" (defaultExpanded=true)
  ├── PinnedItem (固定项)
  ├── Divider (如果有固定项)
  ├── Conversation List (Virtuoso)
  └── New Conversation Button
SidebarSection "任务计划" (defaultExpanded=false)
  └── PersistentTaskPlanSection (内容)
Top Section (AutomationBadge + PulseSidebarSection)
```

关键修改点：

1. **移除 PersistentTaskPlanSection 的直接渲染**（L441）
2. **用 SidebarSection 包装会话列表**：

```tsx
{/* 会话分区 */}
<SidebarSection
  title={t('Sessions')}
  icon={<MessageSquare size={14} />}
  defaultExpanded={true}
>
  {/* 固定项区域 */}
  {pinnedItem && (
    <>
      <PinnedItem
        item={pinnedItem}
        isSelected={pinnedItem.id === currentConversationId}
        onClick={() => {
          const spaceId = useSpaceStore.getState().currentSpace?.id
          if (spaceId) useChatStore.getState().selectConversation(pinnedItem.id)
        }}
      />
      <div className="border-b border-border" />
    </>
  )}

  {/* 会话列表 (Virtuoso) */}
  <div style={{ height: virtuosoHeight }}>
    <Virtuoso
      data={conversations}
      overscan={200}
      itemContent={(_index, conversation) => renderConversationItem(conversation)}
    />
  </div>

  {/* 新对话按钮 */}
  <div className="border-t border-border">
    <button
      onClick={() => {
        const spaceId = useSpaceStore.getState().currentSpace?.id
        if (spaceId) useChatStore.getState().createConversation(spaceId)
      }}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/50 transition-colors"
    >
      <Plus size={14} />
      <span>{t('New conversation')}</span>
    </button>
  </div>
</SidebarSection>

{/* 任务计划分区 */}
<SidebarSection
  title={t('Task plan')}
  icon={<ListTodo size={14} />}
  defaultExpanded={false}
>
  <PersistentTaskPlanSection />
</SidebarSection>
```

3. **获取固定项数据**：从 PulseList 的 `pinnedIdleItems` 获取固定项数据

```tsx
// 在组件内部添加
const pinnedItem = useMemo(() => {
  // 从 pulseItems 中获取 pinned idle 项
  // 这里需要根据实际数据结构调整
  const items = usePulseItems()
  const pinned = items.find(item => item.pinned && item.status === 'idle')
  return pinned ? {
    id: pinned.conversationId,
    title: pinned.title || 'Halo AI 数字人模板',
    status: pinned.status,
  } : null
}, [])
```

- [ ] **Step 4: 调整高度计算**

由于会话列表现在在 SidebarSection 内部，需要调整 Virtuoso 的高度计算：
- 移除原有的 `topSectionHeight` 相关的高度计算
- 新对话按钮移到 SidebarSection 内部
- 确保 Virtuoso 有固定高度容器

- [ ] **Step 5: 验证构建**

运行: `npx electron-vite build 2>&1 | tail -5`
预期: 构建成功

- [ ] **Step 6: 提交**

```bash
git add src/renderer/components/chat/ConversationList.tsx
git commit -m "refactor: 重构 ConversationList 使用 SidebarSection 分区"
```

---

### Task 6: 集成测试和最终验证

**Files:**
- None (验证步骤)

- [ ] **Step 1: 完整构建验证**

运行: `npx electron-vite build`
预期: 构建成功，无错误

- [ ] **Step 2: 功能测试清单**

验证以下功能：
1. 会话分区默认展开，任务计划分区默认折叠
2. 点击分区标题可折叠/展开
3. 固定项（Halo AI 数字人模板）始终显示在会话列表顶部
4. 固定项不可删除/重命名（无 hover 菜单）
5. 会话列表虚拟滚动正常工作
6. 新对话按钮正常工作
7. 清空会话功能正常（保留当前会话）
8. 响应式布局正常（移动端和桌面端）

- [ ] **Step 3: 最终提交（如有修复）**

```bash
git add -A
git commit -m "fix: 修复侧边栏分区重组的细节问题"
```

---

## 注意事项

1. **固定项数据来源**：需要确认 "Halo AI 数字人模板" 的数据来源。根据探索结果，它来自 PulseList 的 `pinnedIdleItems`。如果实际数据结构不同，需要调整 `PinnedItem` 的数据获取逻辑。

2. **Virtuoso 高度**：会话列表使用虚拟滚动，需要确保在 SidebarSection 内部有固定高度容器。

3. **类型定义**：`PinnedItemData` 接口可能需要根据实际数据结构调整。

4. **样式一致性**：确保新组件的样式与现有侧边栏风格一致（颜色、间距、字体等）。
