# Knowledge Base Sidebar Height Fix & Detail View - Design

## Background

知识库面板（`KnowledgeBasePanel`）当前嵌在 `ConversationList` 侧栏顶部，与 `PulseSidebarSection` 同属"顶部固定区"（`ConversationList.tsx:355-360`）。该区域无 `flex-1`，按自然高度堆叠。

问题：文档列表直接 `documents.map()` 全量渲染（`KnowledgeBasePanel.tsx:237`），无条数限制、无独立滚动容器。文档一多，面板高度无限增长，挤压下方 Sessions 区和底部 TaskPlan 面板，破坏侧栏整体布局。

## Goal

1. **侧栏知识库面板固定高度** - 最多显示 3 条文档记录，面板高度不再随文档数增长。
2. **二级详情页** - "查看全部"在 ContentCanvas 打开一个知识库详情 tab，承载完整列表与文档预览。
3. **不破坏现有交互** - 上传、搜索、删除等轻量操作仍在侧栏内完成。

## Non-Goals

- **不重构 `useKnowledgeStore` 数据层** - 只动展示层。
- **不做侧栏高度可拖拽调节** - 固定 3 条已足够，避免引入拖拽状态。
- **不做侧栏内联展开 chunk 详情** - 详情进 canvas 看，保持侧栏轻量。
- **不做知识库的 RAG/搜索能力扩展** - 那属于 `2026-07-11-knowledge-base-rag-design.md` 的范畴。
- **不改动 `PulseSidebarSection` 和 `PersistentTaskPlanPanel`** - 只动 `KnowledgeBasePanel` 和 canvas 层。

## Architecture

### 数据流

```
useKnowledgeStore (不动)
   │
   ├── KnowledgeBasePanel (侧栏，最多 3 条)
   │     └── "查看全部 (N)" → canvasStore.openKnowledgeBase()
   │
   └── KnowledgeBaseCanvasTab (ContentCanvas 新 tab 类型)
         ├── 完整文档列表（虚拟滚动）
         │     └── 点某份文档 → canvasStore.openFile(path) 或 openContent
         └── 复用现有 viewer 渲染文档内容
```

### 关键决策

**为什么选 ContentCanvas tab 而非 Overlay 或侧栏替换视图？**

- **一致性**：项目已有 `canvasStore` tab 机制，文件预览/浏览器/代码查看都走这条路。知识库详情作为 tab，与"点文件打开预览"同一心智模型。
- **不破坏侧栏状态**：侧栏会话/任务列表状态不受影响，关掉 tab 即回原样。
- **复用 viewer**：ContentCanvas 已支持 markdown/code/pdf 等 viewer，文档预览直接复用。
- **可多开**：可同时打开知识库列表 tab + 文档预览 tab，比 Overlay 单层覆盖灵活。

## Components

### 1. KnowledgeBasePanel 改造（侧栏）

**文件**：`src/renderer/components/knowledge/KnowledgeBasePanel.tsx`

变更点：
- 文档列表渲染前，对 `documents` 取 `slice(0, 3)`。当前 store 返回顺序未在文档中保证排序，若实测发现非按更新时间倒序，则在 slice 前显式排序；否则信任 store 顺序。
- 第 3 条下方新增"查看全部 (N)"按钮：
  - 文档总数 > 3 时显示
  - 点击调用 `canvasStore.openKnowledgeBase()`
  - 文案：`t('View all ({{count}})', { count: documents.length })`
- 搜索结果同样限制 3 条。超出 3 条时显示"在详情页查看全部结果"入口，点击进 canvas tab；第一版**不**向 canvas tab 传递搜索态（搜索框在详情页为空，用户需重新输入）。避免跨组件传递搜索态的复杂度，后续若需要可再加。
- 面板本身不设固定高度，靠"3 条 + 按钮"自然限定高度，避免硬编码 `max-h` 导致与折叠态冲突。

**不变**：
- header 折叠/展开逻辑
- 上传、搜索 toggle、删除操作
- 空状态、loading、error 渲染

### 2. ContentType 扩展

**文件**：`src/renderer/services/canvas-lifecycle.ts:37`

`ContentType` 联合类型新增 `'knowledge-base'`：

```typescript
export type ContentType = 'code' | 'markdown' | 'html' | 'image' | 'pdf' | 'text' | 'json' | 'csv' | 'browser' | 'terminal' | 'knowledge-base'
```

### 3. canvasStore 新增 openKnowledgeBase 方法

**文件**：`src/renderer/stores/canvas.store.ts`（及 `canvas-lifecycle.ts`）

- 新增 `openKnowledgeBase(): string` 方法。
- 行为：检查是否已存在 `type === 'knowledge-base'` 的 tab，有则 `switchTab`，无则新建。
- tab 字段：`{ id, type: 'knowledge-base', title: t('Knowledge Base') }`，无 `path`/`content`/`url`。
- 返回 tab id。

### 4. KnowledgeBaseCanvasTab 组件（新）

**文件**：`src/renderer/components/canvas/viewers/KnowledgeBaseViewer.tsx`（新文件）

职责：
- 从 `useKnowledgeStore` 读取完整 `documents` 列表。
- 渲染完整文档列表（文档数预期 < 500，第一版用普通 map + `overflow-y-auto`，不引入虚拟滚动；若后续文档量爆炸再加 Virtuoso）。
- 每条文档：文件名、类型、chunk 数、状态、删除按钮（复用侧栏的删除逻辑）。
- 点击文档行：根据文件类型走 `canvasStore.openFile(doc.sourcePath)`（若 sourcePath 可直接读）或 `openContent`（若需从 store 取 chunk 内容拼接）。第一版优先 `openFile`，失败回退到显示 chunks 拼接内容。
- 顶部保留上传按钮、搜索框（与侧栏同款，但此处是完整版不限 3 条）。

**props**：`{ tab: TabState }`（与现有 viewer 模式一致）。

### 5. ContentCanvas 路由

**文件**：`src/renderer/components/canvas/ContentCanvas.tsx:224-299`

在 `TabContent` 的 `switch(tab.type)` 中新增：

```typescript
case 'knowledge-base':
  return <KnowledgeBaseViewer tab={tab} />
```

## Error Handling

- **打开详情 tab 失败**（canvasStore 异常）：按钮 onClick 包 try/catch，失败时 `console.error` + 不阻塞侧栏。
- **文档预览失败**（openFile 路径不存在）：走现有 canvas 的 error 状态渲染，不额外处理。
- **侧栏删除后列表少于 3 条**：`slice(0, 3)` 自然处理，"查看全部"按钮按 `documents.length > 3` 条件隐藏。

## Testing

- 侧栏文档数 0/1/3/5/20 时，面板高度是否稳定在"3 条以内"。
- "查看全部"按钮在文档数 ≤ 3 时不显示，> 3 时显示且 count 正确。
- 点击"查看全部"在 canvas 打开 tab，重复点击不新开（去重生效）。
- 详情 tab 内删除文档后，侧栏列表同步更新（store 响应式）。
- 详情 tab 内点文档能打开预览 tab。
- 折叠侧栏面板后再展开，3 条限制仍生效。
- 浅色/深色主题下详情 tab 渲染正常。

## Rollout

单次发布，无分阶段。改动集中在：
- 1 个侧栏组件改造（`KnowledgeBasePanel.tsx`）
- 1 个新 viewer 组件（`KnowledgeBaseViewer.tsx`）
- 2 处 canvas 机制扩展（`canvas-lifecycle.ts` 类型 + `canvas.store.ts` 方法 + `ContentCanvas.tsx` 路由）

无数据迁移、无 store schema 变更、无 IPC 变更。
