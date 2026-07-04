# 常驻任务计划侧栏实现方案

> **给自动化工作者：** 必须使用子技能：superpowers:executing-plans 逐任务实施本方案。步骤使用复选框（`- [ ]`）语法进行追踪。

**目标：** 在桌面端右侧栏添加常驻的任务计划区域，使用户可以在中心聊天流持续滚动时持续关注当前会话的执行进度。保留现有的会话列表作为侧栏主要内容，避免在此迭代中添加文件变更摘要、资源指标、LSP 状态或其他低价值元数据。

**架构：** `ConversationList` 保持为右侧栏外壳。一个新的紧凑任务计划区域挂载在现有自动化/Pulse 顶部区域之上，从与中心 `TodoCard` 使用的相同消息/思考数据中读取当前会话的最新 `TodoWrite` 状态。Todo 解析逻辑集中化，使 `ThoughtProcess`、`CollapsedThoughtProcess` 和侧栏使用同一个数据源。侧栏任务计划不引入单独的任务 store 或重复的生命周期状态。

**技术栈：** React 18、TypeScript、Zustand 选择器、TailwindCSS 主题令牌、现有 Halo i18n（通过 `t('English text')`）。

---

## 文件结构

- 修改 `src/renderer/components/tool/TodoCard.tsx`
  - 导出当前组件本地的 todo 项/状态类型。
  - 添加用于提取最新 `TodoWrite` 和 todo 统计的共享辅助函数。
  - 保持现有中心 `TodoCard` 视觉行为不变。

- 添加 `src/renderer/components/chat/PersistentTaskPlanSection.tsx`
  - 紧凑的右侧栏任务计划卡片。
  - 订阅当前空间/当前会话并从消息中提取最新 `TodoWrite`。
  - 无任务计划时隐藏。
  - 支持折叠/展开。
  - 显示进度、当前活动任务和紧凑任务行。
  - 仅使用主题令牌和 `t()` 表示可见字符串。

- 修改 `src/renderer/components/chat/ConversationList.tsx`
  - 在现有顶部区域之上挂载 `PersistentTaskPlanSection`。
  - 保留会话列表及其独立滚动。
  - 保持当前自动化/Pulse 区域及其调整大小行为不变（垂直堆叠除外）。

- 修改 `src/renderer/components/chat/ThoughtProcess.tsx`
  - 将本地最新 todo 提取替换为共享辅助函数。

- 修改 `src/renderer/components/chat/CollapsedThoughtProcess.tsx`
  - 将本地最新 todo 提取替换为共享辅助函数。

- 无主进程、IPC、预加载、API、存储架构或翻译文件更改。

---

## UI 行为

- 桌面端右侧栏顺序：
  1. 侧栏头部：`Conversations`
  2. 常驻任务计划区域（仅在当前会话有 `TodoWrite` 数据时显示）
  3. 现有自动化徽章和 Pulse 区域
  4. 现有会话列表
  5. 现有新建会话按钮

- 空状态：
  - 始终将该区域渲染为常驻分隔线。
  - 如果当前会话没有任务计划，显示一个折叠的头部，以 `t('No task plan')` 作为活动文本行。

- 折叠状态：
  - 头部保持可见，显示进度和活动任务信号。
  - 任务行隐藏。

- 展开状态：
  - 显示进度条。
  - 通过正常排序将当前进行中的项目显示在最前面，进行中时使用 `activeForm` 文本。
  - 在带有最大高度的滚动区域中显示所有任务行。

- 上下文指标：
  - 在第一个实现中不包含，除非在实现过程中已有可靠的当前会话 token 使用选择器可用。
  - 避免添加推测性的 token 计算或估算成本显示。

---

### 任务 1：集中 TodoWrite 辅助函数

**文件：**
- 修改：`src/renderer/components/tool/TodoCard.tsx`

- [ ] **步骤 1：导出 todo 类型**

导出现有的 todo 状态和项形状，以便侧栏可以使用相同的类型：

```ts
export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface TodoItem {
  content: string
  status: TodoStatus
  activeForm?: string
}
```

- [ ] **步骤 2：添加统计辅助函数**

添加一个导出的辅助函数，等效于现有的内联统计计算：

```ts
export function getTodoStats(todos: TodoItem[]) {
  const total = todos.length
  const completed = todos.filter(t => t.status === 'completed').length
  const inProgress = todos.filter(t => t.status === 'in_progress').length
  const pending = todos.filter(t => t.status === 'pending').length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0

  return { total, completed, inProgress, pending, progress }
}
```

- [ ] **步骤 3：添加最新 TodoWrite 辅助函数**

添加一个导出的辅助函数，接受 `Thought[] | null | undefined` 并返回 `TodoItem[] | null`：

```ts
export function getLatestTodosFromThoughts(thoughts?: Thought[] | null): TodoItem[] | null
```

它应找到最新一个 `type === 'tool_use'`、`toolName === 'TodoWrite'` 且 `toolInput` 存在的思考，然后调用 `parseTodoInput`。

- [ ] **步骤 4：在 TodoCard 中复用统计辅助函数**

将 `TodoCard` 中的内联 `useMemo` 函数体替换为 `getTodoStats(todos)`。

---

### 任务 2：在中心思考组件中复用辅助函数

**文件：**
- 修改：`src/renderer/components/chat/ThoughtProcess.tsx`
- 修改：`src/renderer/components/chat/CollapsedThoughtProcess.tsx`

- [ ] **步骤 1：更新导入**

从 `../tool/TodoCard` 导入 `getLatestTodosFromThoughts`，与现有导入一起。

- [ ] **步骤 2：替换重复提取**

将每个本地的 `thoughts.filter(... TodoWrite ...)` 块替换为：

```ts
const latestTodos = useMemo(() => getLatestTodosFromThoughts(thoughts), [thoughts])
```

- [ ] **步骤 3：保留渲染行为**

不要更改现有中心 `TodoCard` 的放置、卡片布局或从可见思考列表中过滤 `TodoWrite` 思考的方式。

---

### 任务 3：构建常驻侧栏区域

**文件：**
- 添加：`src/renderer/components/chat/PersistentTaskPlanSection.tsx`

- [ ] **步骤 1：订阅当前会话消息**

使用 `useChatStore` 选择器读取：
- `currentSpaceId`
- 当前空间的 `currentConversationId`
- 来自 `conversationCache` 的当前会话

通过从最新到最旧遍历消息并调用 `getLatestTodosFromThoughts(message.thoughts)` 来派生最新任务计划。

- [ ] **步骤 2：为空时隐藏**

当没有最新 todos 存在或解析的列表为空时返回 `null`。

- [ ] **步骤 3：渲染紧凑头部**

头部内容：
- `ListTodo` 图标
- `t('Task plan')`
- `{{completed}}/{{total}}` 进度文本
- 折叠箭头

头部使用按钮，`title={collapsed ? t('Expand task plan') : t('Collapse task plan')}`。

- [ ] **步骤 4：渲染进度和行**

展开时：
- 显示细进度条。
- 渲染带有匹配待处理/进行中/已完成状态图标的紧凑行。
- 进行中的行可用时使用 `activeForm`。
- 使用最大高度滚动容器，使长计划不会挤占会话空间。

- [ ] **步骤 5：保持适合侧栏的样式**

使用紧凑间距和仅主题令牌。不要在 `t()` 之外使用硬编码的用户可见文本。

---

### 任务 4：在 ConversationList 中挂载

**文件：**
- 修改：`src/renderer/components/chat/ConversationList.tsx`

- [ ] **步骤 1：导入区域**

从 `./PersistentTaskPlanSection` 导入 `PersistentTaskPlanSection`。

- [ ] **步骤 2：挂载在现有顶部区域之上**

将 `<PersistentTaskPlanSection />` 放在侧栏头部之后、现有自动化/Pulse 顶部区域之前。

- [ ] **步骤 3：保留当前滚动边界**

将会话列表保持在其现有的 `flex-1 overflow-hidden` 容器中，使会话历史保持独立可滚动。

---

### 任务 5：验证实现

**文件：**
- 验证已更改的渲染器文件。

- [ ] **步骤 1：运行 i18n 提取**

运行：

```bash
npm run i18n
```

- [ ] **步骤 2：运行 TypeScript/构建验证**

从 `package.json` 运行项目可用的类型检查或构建命令。

- [ ] **步骤 3：检查生成的差异**

确认：
- 未添加硬编码的可见文本。
- 未添加硬编码的颜色。
- 未添加文件变更/资源/LSP 侧栏内容。
- 未引入单独的 todo 生命周期 store。

---

## 验收标准

- 右侧栏保留现有会话列表。
- 当当前会话有 TodoWrite 数据时，在会话列表上方显示任务计划区域。
- 该区域在中心聊天滚动时保持可见。
- 该区域可以折叠和展开。
- 中心 `TodoCard` 继续按原样渲染。
- Todo 解析是共享的而非重复的。
- 第一个版本不包含文件变更摘要、CPU/内存/磁盘和 LSP 状态。
