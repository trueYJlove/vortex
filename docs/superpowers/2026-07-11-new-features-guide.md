# 新功能使用说明

本文档介绍近期落地的三个功能：智能体推理可视化、知识库 / RAG、可视化工作流编辑器。每个功能从入口位置、操作步骤到注意事项逐一说明。

---

## 一、智能体推理可视化（第一阶段）

### 功能简介

把智能体在聊天中的推理过程（思考、工具调用、条件判断、错误等）从"扁平的 thought 列表"升级为"结构化的步骤卡片"。每个步骤显示状态图标、标题、耗时，可展开查看详情。长文本支持折叠/展开，工具调用显示输入参数与结果。

### 入口位置

聊天界面右侧的 **Thought Process 面板**（推理过程面板）。当智能体开始推理时该面板自动展开。

### 操作步骤

1. 在聊天界面发送消息，智能体开始推理
2. 推理面板自动展开，标题栏显示 "Thought process"
3. 点击标题栏展开内容区
4. **切换视图**：标题栏右侧有两个图标按钮
   - **List 图标**：列表视图（默认，原始扁平 thought 列表）
   - **GitBranch 图标**：步骤视图（结构化 StepCard 卡片时间线）
5. 在步骤视图中：
   - 每个步骤卡片左侧有圆形状态图标（运行中/已完成/错误）
   - 点击卡片标题栏可展开/折叠详情
   - thinking 步骤：显示推理文本，长文本显示 "Expand" 按钮
   - tool_call 步骤：显示工具名 + 友好参数摘要，展开后可查看原始 JSON 和工具结果
   - Task / Agent 子智能体步骤：内联显示子时间线
6. 面板底部在内容较多时显示 "Full / Compact" 切换按钮，最大化查看

### 注意事项

- 第一阶段仅做展示增强，不改变后端推理逻辑
- 步骤视图与列表视图共用同一份 thoughts 数据，切换不会丢失状态
- 移动端默认可用，所有文案已 i18n 包裹

---

## 二、知识库 / RAG

### 功能简介

为每个 Space 提供本地知识库：上传文档（`.txt`、`.md`、`.json`、`.csv`、`.pdf`）后自动分块、建立 FTS5 全文索引；Space artifacts 目录下的文件变化时自动索引/移除。智能体在对话和自动化执行时可调用 `knowledge_search` 工具检索相关片段。

### 入口位置

**聊天界面左侧侧边栏底部**的 "Knowledge Base" 可折叠面板。

### 操作步骤

#### 上传文档

1. 打开聊天界面，左侧侧边栏底部找到 "Knowledge Base" 面板
2. 点击面板标题栏展开
3. 点击 **Upload** 按钮
4. 在文件选择器中选中一个或多个文档（支持 `.txt`、`.md`、`.json`、`.csv`、`.pdf`，单文件最大 50MB）
5. 上传完成后文档列表自动刷新，显示文件名、类型、分块数

#### 搜索文档

1. 在 Knowledge Base 面板中点击 **Search 图标**按钮
2. 展开搜索输入框
3. 输入关键词，实时返回匹配的文档片段（最多 5 条）
4. 每条结果显示文档名、分块索引、相关度百分比和内容预览
5. 点击输入框右侧 X 清空搜索

#### 删除文档

1. 在文档列表中 hover 目标文档行
2. 右侧出现 **Trash 图标**
3. 点击删除，文档及其所有分块从索引中移除

#### Artifact 自动索引

无需手动操作。当 Space 的 artifacts 目录下有支持的文件类型发生增/改/删时：
- **新增 / 修改**：500ms 防抖后自动索引
- **删除**：立即从索引中移除

### 智能体如何使用知识库

- **自动化 App 执行**：App 运行时，知识库文档列表会注入到初始消息中，同时注册 `knowledge_search` MCP 工具，AI 可主动检索
- **交互式对话**：聊天会话同样注入知识摘要 + 注册检索工具

### 注意事项

- 50MB 单文件上限：超过会在上传时跳过并发送错误状态
- 相同内容（SHA-256 哈希一致）不会重复索引
- 文件内容更新会自动重新索引（删除旧分块 + 插入新分块）
- PDF 解析失败时会以空内容建立索引条目（保留文档记录但不报错）

---

## 三、可视化工作流编辑器

### 功能简介

为 automation 类型的 App 提供可视化的 DAG 工作流编辑器。用户在画布上拖拽节点、连线、编辑属性，保存后写入 App spec 的 `steps` 字段。运行时按 DAG 顺序执行每个节点，并记录每步的输入/输出/状态到 `workflow_runs` 与 `workflow_node_runs` 表，支持执行回放。

### 节点类型

| 类型 | 说明 |
|------|------|
| **LLM Call** | 调用 LLM：可配置 prompt、工具列表、输出字段映射 |
| **Tool Call** | 调用 MCP 工具：可配置工具名、参数 |
| **Condition** | 条件分支：可配置输入变量、多个 case（eq/neq/contains/matches/gt/lt/gte/lte）、default 跳转 |

### 入口位置

**Apps 页面 → 选中 automation App → Settings 标签 → Workflow 标签**。

### 编辑工作流

1. 导航到 **Apps** 页面
2. 在左侧 App 列表中选中一个 automation 类型 App
3. 点击头部的 **Settings**（齿轮图标）标签，打开配置面板
4. 在配置面板顶部标签栏中点击 **Workflow** 标签（仅 automation App 显示）
5. 进入编辑器画布：
   - **添加节点**：点击顶部工具栏的 **LLM** / **Tool** / **Condition** 按钮，节点出现在画布中央
   - **连线**：拖拽节点底部的输出端口到另一个节点顶部的输入端口
   - **编辑属性**：点击节点选中，右侧弹出 **Property Panel**，按节点类型显示对应表单
     - LLM Call：prompt 文本框、tools 列表、output 映射
     - Tool Call：tool 名称、params 编辑器
     - Condition：input 变量、cases 编辑器（when + goto）、default
   - **重置**：点击工具栏 **RotateCcw** 按钮，放弃当前改动回到已保存状态
   - **保存**：点击工具栏 **Save** 按钮，序列化画布为 `steps` 写入 App spec
6. 保存成功后出现 "Saved" 提示

### 执行回放（Run Replay）

1. 在 automation App 头部点击 **Run History**（历史图标）标签
2. 右侧面板展示该 App 的历史运行列表
3. 选中一条运行记录，查看每个节点的执行状态、输入、输出、耗时
4. 节点按状态着色：completed（绿）、running（蓝）、pending（灰）、error（红）、skipped（暗）

### 变量引用语法

节点 prompt / params 中支持 `${...}` 变量引用，运行时从 WorkflowContext 解析：

| 引用 | 含义 |
|------|------|
| `${memory.field}` | App 内存快照中的字段（工作流启动时读取一次） |
| `${trigger.field}` | 触发事件数据中的字段 |
| `${step_id.field}` | 上游步骤输出中的字段（如 `${fetch_price.price}`） |
| `${llm_result}` | 当前 LLM 节点的原始文本输出 |

### 注意事项

- 编辑器**仅桌面可用**：移动端访问 Workflow 标签时显示提示文案，不支持编辑
- 工作流模式与自主 AI 模式共存：App spec 没有 `steps` 字段时走原有 `executeRun` 路径，有 `steps` 字段时走 `executeWorkflow`
- DAG 校验在保存时执行：goto 引用必须指向已存在的 step id，不允许循环引用
- 每次工作流执行都会在 `workflow_runs` 表创建记录，每个节点执行在 `workflow_node_runs` 表创建记录

---

## 附：开发调试提示

### better-sqlite3 原生模块

如果运行测试或启动应用时遇到 `NODE_MODULE_VERSION 137 vs 121` 错误，说明 `better-sqlite3` 为系统 Node 编译，需要重编译为 Electron ABI：

```bash
npx electron-rebuild -f -w better-sqlite3 --only better-sqlite3
```

`--only` 参数避开 `node-pty` 在 Windows 上的重建失败问题。
