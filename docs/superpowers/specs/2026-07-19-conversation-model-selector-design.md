# 会话级模型选择器设计

## 问题

当前 AI 模型选择只有全局配置入口（右上角 ModelSelector + 设置页），所有会话共享同一个模型配置。虽然代码层面已有会话级 `modelSourceId`/`modelId` pin 机制，但 UI 上无任何区分：

1. 用户在会话 A 选择 DeepSeek → 全局默认被改写为 DeepSeek
2. 新建会话 B → 自动继承全局默认 DeepSeek，用户以为"这个会话就应该用 DeepSeek"
3. 用户无法区分"这个会话我正在用 DeepSeek"和"全局默认就是 DeepSeek"

## 目标

1. 用户能**一目了然**当前会话在用哪个模型
2. 用户能为**每个会话独立选择**模型，不影响其他会话
3. 用户在输入消息的上下文中就能切换模型，不需要抬头找右上角

## 设计

### 职责分离

| 入口 | 职责 | 作用域 |
|------|------|--------|
| 右上角 ModelSelector | 快速切换全局默认模型 | 全局 |
| 设置页 AI Sources | 管理 provider、API key、模型能力 | 全局 |
| **输入框模型选择器**（新增） | 查看/切换当前会话模型 | **会话级** |

### 布局

模型选择器放在 InputToolbar 左侧群组，紧跟在"深度思考"按钮右侧：

```
┌─────────────────────────────────────────────────────────┐
│ [+ Attachment] [⚙ Tools] [⚛ 深度思考] [● DeepSeek V3 Session ▼]    [↑ Send] │
└─────────────────────────────────────────────────────────┘
```

群组逻辑为 **"AI 配置"**：工具决定能做什么 → 深度思考决定怎么想 → 模型决定能力上限。

### 交互

**闭合状态**（药丸形按钮，`h-8 px-2.5 rounded-lg`）：

- 模型名称：当前会话使用的模型名（与标题栏 ModelSelector 一致）
- `Session` 标签：仅当会话已 pin 模型时显示，提示"这个选择只影响当前会话"
- 下拉箭头（ChevronDown）：点击展开模型面板

注意：InputToolbar 中的按钮不需要图标（如 Tools 按钮带 `SlidersHorizontal` 图标），模型选择器同样以简洁文本药丸呈现。

**展开状态**（下拉面板）：

- 复用现有 ModelList 组件（同全局 ModelSelector 中的模型列表）
- 选中状态显示 checkmark
- 面板标题显示当前会话 pin 的模型名称（如有）

### 状态规则

- **会话已 pin 模型**：药丸显示 pin 的模型 + `Session` 标签，下拉中该模型有 checkmark
- **会话未 pin**：药丸显示全局默认模型（无 `Session` 标签），下拉中全局默认有 checkmark
- **用户在列表中点击模型**：执行 `setConversationModel()` pin 到当前会话，药丸更新 + 出现 `Session` 标签
- **切换会话**：药丸自动更新为新会话的模型（或全局默认）
- **新建会话**：取全局默认，无 `Session` 标签

### 与全局 ModelSelector 的关系

- 全局 ModelSelector 依然保留，用于快速切换全局默认
- 两个选择器在模型列表中显示相同的 checkmark 规则（但全局的 pin 也影响会话的 fallback）
- 用户在输入框选择器中选择模型后，全局默认**不变**，只 pin 到当前会话

### 数据结构（无变更）

会话级模型 pin 已存在于 `Conversation.modelSourceId` / `Conversation.modelId`，无需新增字段。

解析链：

```
getApiCredentialsForConversation()
  → 会话有 modelSourceId? → 使用会话 pin
  → 否则 → 使用全局默认
```

### 移动端

- 移动端 InputToolbar 同样渲染模型选择器
- 点击后弹出 ModelSelectSheet（复用现有移动端底部面板）
- `Session` 标签在移动端同样显示，保持一致性
- 如果屏幕极窄，模型名可截断（`truncate`），`Session` 标签优先保留

### 远程访问同步

#### 问题场景

远程访问模式下（手机通过 remote access 连接到宿主机），会话模型切换需要跨设备同步：

```
远端选择 DeepSeek V3
  → api.updateConversation(spaceId, convId, { modelSourceId, modelId })
    → HTTP → 宿主机 conversation.service.updateConversation()
      → 写磁盘 JSON ✓
    → 远端 store setConversation() 更新本地缓存 ✓
    → 宿主下次发消息时读 getConversation() → 取磁盘 JSON → 新值 ✓
```

当前 `updateConversation` 只完成「写磁盘」这一步，远端侧 store 需要从响应中获取更新后的 conversation 来刷新本地缓存。

#### 数据流

```
远端选择模型
  → api.updateConversation(spaceId, convId, payload)
  → IPC/HTTP → main process 写 JSON
  → 响应中返回更新后的完整 conversation 对象
  → 远端 store setConversation() 更新本地缓存

宿主（如果有其他 UI 页面打开）：
  宿主的 conversation 数据同样通过 chat.store 订阅，
  如果宿主也需要实时感知远端改的模型——目前没有这个需求，
  宿主自身能改模型，且不会在发消息时读到旧值（读的是磁盘 JSON）。
```

#### 关键决策

**不需要 WebSocket 广播。** 理由：

- 宿主机发消息时走 `getApiCredentialsForConversation()` 解析链，该函数从磁盘加载 conversation JSON（`src/main/services/conversation.service.ts` 的 `getConversation()`），远端写入后宿主下次发消息自然读到新值
- 仅当宿主机 UI 上实时展示「当前会话模型」（即输入框药丸）时才需要同步——但用户在同一台机器上不会在 UI 中专门等远端来改，这是低频边缘场景
- `updateConversation` API 响应中返回更新后的 conversation 就足够覆盖远端自身的 UI 刷新

#### 远端侧实现

```typescript
// remote config.api
async updateConversation(spaceId: string, convId: string, updates: Partial<Conversation>) {
  const response = await http.post('/api/conversations/update', { spaceId, convId, updates })
  // response.data 为更新后的 Conversation 对象
  if (response.data) {
    useChatStore.getState().setConversation(spaceId, convId, response.data)
  }
}
```

与 Electron 侧现有实现对齐即可。当前 Electron 侧 `updateConversation` 在 IPC handler 中写 JSON 后返回成功标志，改为返回完整的 conversation 数据。

## 未包含（YAGNI）

- 空间级模型配置：不需要，会话 pin + 全局默认已覆盖用户场景
- 批量修改会话模型：当前无此需求
- 模型对比视图：超出范围
- 会话模板/预设模型绑定：超出范围

## 实施计划

### Phase 1：InputToolbar 模型药丸

1. 在 `InputArea.tsx` 的 InputToolbar 左侧群组中新增模型选择器药丸
2. 药丸显示：模型名 + (pin 时 `Session` 标签) + 下拉箭头
3. 点击药丸展开模型下拉面板（复用 ModelList 组件）
4. 选中模型后调用 `chat.store.setConversationModel()` pin 到当前会话，全局默认不变
5. 会话间切换时药丸自动更新

### Phase 2：移动端适配 + 面板标题优化

1. 移动端 InputToolbar 显示模型选择器，点击弹出 ModelSelectSheet
2. 窄屏时模型名截断，`Session` 标签优先保留
3. 下拉面板标题显示当前上下文的模型归属
