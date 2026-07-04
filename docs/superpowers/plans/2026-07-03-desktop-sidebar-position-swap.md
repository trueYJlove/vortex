# 桌面侧栏位置交换实现方案

> **给自动化工作者：** 必须使用子技能：superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本方案。步骤使用复选框（`- [ ]`）语法进行追踪。

**目标：** 交换桌面端构件栏和会话列表的位置，同时保持移动端行为不变。

**架构：** `SpacePage` 仍然是布局编排器，控制桌面端排序。`ConversationList` 和 `ArtifactRail` 各自增加 `side?: 'left' | 'right'` 属性，使调整大小手柄、边框和切换提示能够匹配其渲染位置，而无需复制组件。移动端代码路径继续使用当前的覆盖层行为，不接收特定于侧边的布局更改。

**技术栈：** React 18、TypeScript、TailwindCSS 主题令牌、Zustand store、Vitest（用于实用的聚焦渲染器逻辑测试）、electron-vite 构建验证。

---

## 文件结构

- 修改 `src/renderer/pages/SpacePage.tsx`
  - 将桌面端 `ArtifactRail` 移到聊天/画布区域之前。
  - 将桌面端 `ConversationList` 移到聊天/画布区域之后。
  - 向桌面端 `ArtifactRail` 传递 `side="left"`，向桌面端 `ConversationList` 传递 `side="right"`。
  - 将隐藏的会话列表切换按钮从聊天区域左边缘移到右边缘。
  - 保持移动端布局不变。

- 修改 `src/renderer/components/chat/ConversationList.tsx`
  - 添加 `side?: 'left' | 'right'` 属性，默认为 `left`。
  - 使水平调整方向感知侧边。
  - 将调整大小手柄放在外边缘：左侧栏在右边缘，右侧栏在左边缘。
  - 在右侧渲染时将边框侧从 `border-r` 切换为 `border-l`。
  - 在右侧渲染时翻转关闭箭头。

- 修改 `src/renderer/components/artifact/ArtifactRail.tsx`
  - 添加 `side?: 'left' | 'right'` 属性，默认为 `right`。
  - 使桌面端调整方向感知侧边。
  - 将调整大小手柄放在内边缘：右侧栏在左边缘，左侧栏在右边缘。
  - 在左侧渲染时将边框侧从 `border-l` 切换为 `border-r`。
  - 调整左侧渲染时展开/折叠箭头的方向。
  - 保持移动端覆盖层路径不变。
  - 移除构件栏切换路径中当前存在的临时调试日志。

- 无新 CSS 文件。
- 无 IPC、预加载、API、store、持久化架构或主进程更改。

---

### 任务 1：添加感知侧边的 ConversationList 行为

**文件：**
- 修改：`src/renderer/components/chat/ConversationList.tsx`

- [ ] **步骤 1：扩展属性**

修改属性接口和解构以包含 side 属性：

```ts
interface ConversationListProps {
  onClose?: () => void
  /** Whether the sidebar is currently visible (used to skip heavy Pulse section when hidden) */
  visible?: boolean
  side?: 'left' | 'right'
}

export const ConversationList = memo(function ConversationList({
  onClose,
  visible = true,
  side = 'left',
}: ConversationListProps) {
```

- [ ] **步骤 2：使调整大小计算感知侧边**

将水平调整大小计算替换为：

```ts
const containerRect = containerRef.current.getBoundingClientRect()
const newWidth = side === 'right'
  ? containerRect.right - e.clientX
  : e.clientX - containerRect.left
const clampedWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth))
setWidth(clampedWidth)
widthRef.current = clampedWidth
```

确保效果依赖包含 `side`：

```ts
}, [isDragging, side])
```

- [ ] **步骤 3：使容器边框感知侧边**

将根类名替换为：

```tsx
className={`${side === 'right' ? 'border-l' : 'border-r'} border-border flex flex-col bg-card/50 relative`}
```

- [ ] **步骤 4：在右侧放置时翻转关闭图标**

将关闭图标替换为：

```tsx
<ChevronLeft className={`w-4 h-4 ${side === 'right' ? 'rotate-180' : ''}`} />
```

- [ ] **步骤 5：将调整大小手柄移到正确的边**

将拖动手柄类名替换为：

```tsx
className={`absolute ${side === 'right' ? 'left-0' : 'right-0'} top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/50 transition-colors z-20 ${
  isDragging ? 'bg-primary/50' : ''
}`}
```

- [ ] **步骤 6：稍后通过构建在本地验证 TypeScript**

暂不运行完整构建；继续进行构件栏更改，以便布局作为一个连贯的单元进行编译。

---

### 任务 2：添加感知侧边的 ArtifactRail 行为

**文件：**
- 修改：`src/renderer/components/artifact/ArtifactRail.tsx`

- [ ] **步骤 1：扩展属性**

修改属性接口和函数解构以包含 side：

```ts
interface ArtifactRailProps {
  // External control props for Canvas integration
  externalExpanded?: boolean        // Controlled expanded state from parent
  onExpandedChange?: (expanded: boolean) => void  // Callback when user toggles
  // Width persistence
  initialWidth?: number             // Persisted width from config
  onWidthChange?: (width: number) => void  // Callback when user finishes resizing
  side?: 'left' | 'right'
}

export function ArtifactRail({
  externalExpanded,
  onExpandedChange,
  initialWidth,
  onWidthChange,
  side = 'right'
}: ArtifactRailProps) {
```

- [ ] **步骤 2：移除临时切换调试日志**

在 `handleToggleExpanded` 中，移除两个仅调试用的日志：

```ts
console.log('[ArtifactRail] 🔴 Click! isExpanded:', isExpanded, 'time:', Date.now())
console.log('[ArtifactRail] 🚀 Direct DOM update:', targetWidth, 'time:', Date.now())
```

移除调试效果：

```ts
// Debug: log when isExpanded changes
useEffect(() => {
  console.log('[ArtifactRail] 🟢 isExpanded changed to:', isExpanded, 'time:', Date.now())
}, [isExpanded])
```

保留现有的构件变更日志，因为它报告的是真实数据事件，且不在此临时切换路径中。

- [ ] **步骤 3：使桌面端调整大小计算感知侧边**

将 mousemove 宽度计算替换为：

```ts
const rect = railRef.current.getBoundingClientRect()
const newWidth = side === 'left'
  ? e.clientX - rect.left
  : rect.right - e.clientX
const clampedWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth))
setWidth(clampedWidth)
widthRef.current = clampedWidth
```

确保效果依赖包含 `side`：

```ts
}, [isDragging, isMobile, side])
```

- [ ] **步骤 4：使桌面端容器边框感知侧边**

将桌面端根类名替换为：

```tsx
className={`h-full flex-shrink-0 ${side === 'left' ? 'border-r' : 'border-l'} border-border bg-card/30 flex flex-col relative`}
```

- [ ] **步骤 5：将拖动手柄移到内边缘**

将桌面端拖动手柄类名替换为：

```tsx
className={`absolute ${side === 'left' ? 'right-0' : 'left-0'} top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/50 transition-colors z-20 ${
  isDragging ? 'bg-primary/50' : ''
}`}
```

- [ ] **步骤 6：调整切换箭头方向**

将箭头类名表达式替换为：

```tsx
<ChevronRight className={`w-4 h-4 transition-transform ${
  side === 'left'
    ? (isExpanded ? 'rotate-180' : '')
    : (isExpanded ? '' : 'rotate-180')
}`} />
```

这使箭头相对于栏的侧边指向折叠/展开方向。

---

### 任务 3：交换 SpacePage 中的桌面布局顺序

**文件：**
- 修改：`src/renderer/pages/SpacePage.tsx`

- [ ] **步骤 1：将桌面端 ArtifactRail 移到桌面聊天/画布组之前**

将此块放在主要内容 flex 内部、桌面布局片段之前：

```tsx
{/* Artifact rail - desktop left side, auto-collapses when maximized via useEffect above */}
{/* Smart collapse: collapses when canvas is open, respects user preference */}
{!isMobile && (
  <ArtifactRail
    side="left"
    externalExpanded={effectiveRailExpanded}
    onExpandedChange={setRailExpanded}
    initialWidth={artifactRailWidthConfig}
    onWidthChange={handleArtifactRailWidthChange}
  />
)}
```

- [ ] **步骤 2：将桌面端 ConversationList 移到桌面聊天/画布组之后**

将此块放在桌面布局片段之后、移动端布局块之前：

```tsx
{/* Conversation list sidebar - desktop right side, CSS hidden when collapsed or maximized, unmounted on mobile */}
{!isMobile && (
  <div style={{ display: showConversationList && !isCanvasMaximized ? 'flex' : 'none' }}>
    <ConversationList
      side="right"
      onClose={handleToggleConversationList}
      visible={showConversationList && !isCanvasMaximized}
    />
  </div>
)}
```

- [ ] **步骤 3：将浮动会话列表切换按钮移到右边缘**

替换：

```tsx
<div className="absolute top-2 left-0 z-10">
```

为：

```tsx
<div className="absolute top-2 right-0 z-10">
```

- [ ] **步骤 4：移除主要内容末尾的旧桌面端 ArtifactRail 块**

删除之前未传递 `side="left"` 的右侧 `ArtifactRail` 块。

- [ ] **步骤 5：保持移动端 ArtifactRail 不变**

保持此块不变：

```tsx
{isMobile && (
  <ArtifactRail />
)}
```

---

### 任务 4：运行聚焦验证

**文件：**
- 仅读取/验证已更改的文件。

- [ ] **步骤 1：运行构建**

运行：

```bash
npm run build
```

预期：
- 退出码 0
- 无 TypeScript 错误
- 如果现有 Vite/browserlist 警告不是由此次更改引入的，则可接受

- [ ] **步骤 2：运行 i18n**

运行：

```bash
npm run i18n
```

预期：
- 如果 `.env.local` 存在，提取和翻译完成。
- 如果 `.env.local` 缺失，报告确切失败并确认此布局更改未添加新的用户可见字符串。

- [ ] **步骤 3：手动 UI 验证清单**

在运行的应用中验证：

```text
桌面端：
[ArtifactRail] [ChatView] [ContentCanvas 打开时] [ConversationList]

ArtifactRail 左侧：
- 展开/折叠状态正常
- 调整大小手柄出现在右边缘
- 向右拖动加宽
- 向左拖动变窄
- 边框在右边缘

ConversationList 右侧：
- sidebarOpen 为 true 时可见
- 切换关闭时隐藏
- 浮动切换出现在聊天区域右边缘
- 调整大小手柄出现在左边缘
- 向左拖动加宽
- 向右拖动变窄
- 边框在左边缘

画布：
- 打开构件仍在 ChatView 右侧打开 ContentCanvas
- 聊天/画布调整大小仍从 ChatView 右边缘工作
- 最大化画布仍隐藏 ConversationList 并根据现有行为自动折叠 ArtifactRail

移动端：
- ChatView 保持全宽
- 移动端 ChatHistoryPanel 保持不变
- 移动端 ArtifactRail 保持浮动按钮 + 覆盖层
```

---

## 自检

- 规范覆盖：方案涵盖了桌面布局交换、两个组件的感知侧边属性、移动端不变行为、调整方向、边框方向、切换放置和验证。
- 占位符扫描：没有 `TBD`、`TODO`、模糊的实现步骤或对未定义函数的引用。
- 类型一致性：两个组件使用相同的 `side?: 'left' | 'right'` 属性形状。`SpacePage` 向 `ArtifactRail` 传递 `side="left"`，向 `ConversationList` 传递 `side="right"`。
