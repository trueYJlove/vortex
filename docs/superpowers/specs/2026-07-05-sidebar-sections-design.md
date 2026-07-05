# 右侧边栏分区重组设计

## 问题

当前右侧边栏的所有内容（会话列表、任务计划、固定项等）都混合在"对话"区域中，缺乏清晰的结构划分。用户希望将不同功能区域分离为独立的可折叠分区，提升信息组织性和可发现性。

## 目标

1. 将侧边栏拆分为"会话"和"任务计划"两个独立分区
2. 每个分区可独立折叠/展开
3. "Halo AI 数字人模板"作为固定项始终显示在会话列表顶部
4. 架构预留扩展能力，便于后续添加新分区

## 设计

### 整体布局

```
┌─ 对话 ─────────────────────┐
│ [≡] 会话             [▸]  │  ← 固定头部
├─────────────────────────────┤
│  🟢 Halo AI 数字人模板    │  ← 会话分区（可折叠）
│    运行中                   │
│  ─────────────────────────  │
│  📋 会话 1                  │
│  📋 会话 2                  │
│  📋 会话 3                  │
│                             │
│  [+] 新对话                  │
├─────────────────────────────┤
│  ▾ 任务计划           [▸]  │  ← 任务计划分区（可折叠）
│  ████████░░░░ 3/5          │
│  ☐ 任务 1                   │
│  ☑ 任务 2                   │
│  ☐ 任务 3                   │
└─────────────────────────────┘
```

### 组件架构

#### 新增组件

1. **`SidebarSection`** — 通用可折叠分区容器
   - 位置：`src/renderer/components/layout/SidebarSection.tsx`
   - Props：
     - `title: string` — 分区标题
     - `icon: React.ReactNode` — 标题图标
     - `defaultExpanded?: boolean` — 默认展开状态（默认 true）
     - `badge?: React.ReactNode` — 可选徽章（如数量提示）
     - `actions?: React.ReactNode` — 可选操作按钮
     - `children: React.ReactNode` — 分区内容
   - 内部状态：`expanded`（boolean）
   - 样式：
     - 头部：`flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 cursor-pointer`
     - 标题：`text-sm font-medium text-muted-foreground`
     - 折叠按钮：Lucide `ChevronDown`/`ChevronRight`，16px
     - 内容区：折叠时 `hidden`，展开时 `block`
     - 分区间：`border-t border-border`，间距 8px

2. **`PinnedItem`** — 固定项组件
   - 位置：`src/renderer/components/chat/PinnedItem.tsx`
   - Props：
     - `item: PinnedItemData` — 固定项数据
     - `isSelected: boolean` — 是否选中
     - `onClick: () => void` — 点击回调
   - 样式：与普通会话项一致，但无 hover 时的删除/重命名按钮
   - 始终显示在会话列表顶部，不可拖拽排序

#### 修改组件

1. **`ConversationList`** — 重构为使用 `SidebarSection` 包装
   - 移除顶层的 `PersistentTaskPlanSection`
   - 会话列表用 `SidebarSection` 包装，标题"会话"
   - 新增任务计划 `SidebarSection`，标题"任务计划"
   - 会话列表内部结构：
     - 固定项区域（`PinnedItem`）
     - 分割线（如果有固定项）
     - 普通会话列表（Virtuoso 虚拟滚动）
     - 新对话按钮

2. **`PersistentTaskPlanSection`** — 保持现有逻辑
   - 作为任务计划 `SidebarSection` 的子内容
   - 移除自身的折叠/展开逻辑（由 `SidebarSection` 管理）
   - 保留进度条和 todo 列表渲染

### 数据流

- 会话列表的虚拟滚动保持不变
- 任务计划的数据来源不变（从 `useChatStore` 获取 todos）
- 固定项从 PulseSidebarSection 的数据中获取（`Halo AI 数字人模板`）

### 折叠/展开行为

- **会话分区**：默认展开，折叠时隐藏会话列表和新对话按钮
- **任务计划分区**：默认折叠，展开时显示进度条和 todo 列表
- 折叠状态不持久化（每次打开侧边栏恢复默认状态）

### 固定项行为

- "Halo AI 数字人模板"始终显示在会话列表顶部
- 有绿色状态点表示运行中
- 点击可选中该会话（如果它是会话）
- 不可删除、不可重命名、不可拖拽排序

### 样式规范

- **分区头部**：`text-sm font-medium text-muted-foreground`，与现有侧边栏文字风格一致
- **折叠按钮**：使用 Lucide `ChevronDown`/`ChevronRight` 图标，16px
- **分割线**：`border-t border-border`，分区之间有 8px 间距
- **固定项**：与普通会话项样式一致，但无 hover 时的删除/重命名按钮

### 响应式

- 移动端（< 640px）：分区头部文字缩小到 12px
- 桌面端（≥ 640px）：保持 14px

### 边界情况

1. **会话列表为空**：显示"暂无会话"提示，新对话按钮仍可用
2. **任务计划为空**：显示"暂无任务计划"提示
3. **多个固定项**：当前只有一个（Halo AI 数字人模板），未来可扩展
4. **侧边栏宽度调整**：拖拽手柄保持在最右侧，不影响分区布局
5. **虚拟滚动**：会话列表保持虚拟滚动，固定项在滚动区域外

## i18n

新增翻译键：

| Key | en | zh-CN |
|-----|----|-------|
| `Sessions` | Sessions | 会话 |
| `No sessions` | No sessions | 暂无会话 |

注：`Task plan` 已存在，无需新增。

## 实现

### 文件变更

1. **新增** `src/renderer/components/layout/SidebarSection.tsx`
2. **新增** `src/renderer/components/chat/PinnedItem.tsx`
3. **修改** `src/renderer/components/chat/ConversationList.tsx`
   - 移除 `PersistentTaskPlanSection` 的直接渲染
   - 使用 `SidebarSection` 包装会话列表
   - 新增任务计划 `SidebarSection`
   - 集成 `PinnedItem`
4. **修改** `src/renderer/components/chat/PersistentTaskPlanSection.tsx`
   - 移除自身的折叠/展开逻辑
   - 保留内容渲染

### 验证

- 构建：`npx electron-vite build`
- 测试折叠/展开行为
- 验证固定项始终显示在顶部
- 检查虚拟滚动性能
- 测试响应式布局
