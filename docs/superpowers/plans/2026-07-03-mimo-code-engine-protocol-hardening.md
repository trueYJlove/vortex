# MiMo Code 引擎协议加固实现方案

> **给自动化工作者：** 必须使用子技能：superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本方案。步骤使用复选框（`- [ ]`）语法进行追踪。

**目标：** 使 MiMo Code 引擎适配器与 Halo 的 Claude Code 兼容代理协议对齐，确保思考、工具调用、工具结果和失败能够正确流式传输，同时不影响现有引擎。

**架构：** MiMo 特定的事件规范化保留在 `src/main/services/agent/mimo/` 下。共享的代理消费者保持引擎无关；引擎特定的命令和技能处理在到达 `session-consumer.ts` 或 `stream-processor.ts` 之前进行规范化。

**技术栈：** Electron 主进程、TypeScript、Vitest、Halo 代理服务、MiMo SDK v2 SSE 流。

---

## 文件结构

- 修改：`src/main/services/agent/mimo/event-normalizer.ts`
  - 负责 MiMo 原生事件到 Halo/Claude 流帧的转换。
  - 必须为工具输入发出 `input_json_delta`，并在工具结果之前发出助手聚合帧。
- 修改：`src/main/services/agent/mimo/session-adapter.ts`
  - 负责 MiMo 会话生命周期、SSE 订阅、HTTP 提示回退和错误结果发出。
  - 不得依赖共享的 `sdk-config.ts` 来处理 MiMo 私有技能内容。
- 创建：`src/main/services/agent/mimo/skill-context.ts`
  - 负责 MiMo 专属的技能发现和技能文件加载。
- 修改：`src/main/services/agent/sdk-config.ts`
  - 移除 MiMo 专属的 `_installedSkills` 注入和导出的 MiMo 技能读取器。
- 修改：`src/main/services/agent/session-manager.ts`
  - 停止在共享预热路径中将所有支持的命令视为技能。
- 创建：`tests/unit/services/agent/mimo/event-normalizer.test.ts`
  - 针对思考、文本、工具输入、助手聚合、工具结果排序的协议级测试。
- 修改：`tests/unit/services/agent/mimo/session-adapter-fallback.test.ts`
  - 添加提示失败测试并更新 mock 以使用 MiMo 本地技能上下文。

---

## 任务 1：添加 MiMo 规范化器协议测试

**文件：**
- 创建：`tests/unit/services/agent/mimo/event-normalizer.test.ts`
- 测试目标：`src/main/services/agent/mimo/event-normalizer.ts`

- [ ] **步骤 1：编写失败测试**

添加以下断言测试：

```ts
import { describe, expect, it } from 'vitest'
import { MimoEventNormalizer } from '../../../../../src/main/services/agent/mimo/event-normalizer'

const event = (type: string, properties: Record<string, any>) => ({ type, properties })
const streamEvents = (frames: any[]) => frames.filter(frame => frame?.type === 'stream_event').map(frame => frame.event)

describe('MimoEventNormalizer', () => {
  it('emits thinking deltas for reasoning parts', () => {
    const normalizer = new MimoEventNormalizer({ sessionId: 'session-1', model: 'mimo-test' })

    const frames = [
      ...normalizer.normalize(event('message.updated', { info: { id: 'message-1', role: 'assistant' } })),
      ...normalizer.normalize(event('message.part.updated', { part: { id: 'reasoning-1', type: 'reasoning', text: '' } })),
      ...normalizer.normalize(event('message.part.delta', { partID: 'reasoning-1', field: 'text', delta: 'Thinking now.' })),
    ]

    expect(streamEvents(frames)).toContainEqual({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '' },
    })
    expect(streamEvents(frames)).toContainEqual({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: 'Thinking now.' },
    })
  })

  it('emits tool input json deltas before closing a tool block', () => {
    const normalizer = new MimoEventNormalizer({ sessionId: 'session-1', model: 'mimo-test' })

    const frames = [
      ...normalizer.normalize(event('message.updated', { info: { id: 'message-1', role: 'assistant' } })),
      ...normalizer.normalize(event('message.part.updated', {
        part: {
          id: 'tool-part-1',
          type: 'tool',
          callID: 'tool-call-1',
          tool: 'read',
          state: { input: { file_path: '/tmp/a.txt' } },
        },
      })),
    ]

    expect(streamEvents(frames)).toContainEqual({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'tool-call-1', name: 'Read', input: {} },
    })
    expect(streamEvents(frames)).toContainEqual({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify({ file_path: '/tmp/a.txt' }) },
    })
  })

  it('emits assistant aggregate before matching tool result', () => {
    const normalizer = new MimoEventNormalizer({ sessionId: 'session-1', model: 'mimo-test' })

    const frames = [
      ...normalizer.normalize(event('message.updated', { info: { id: 'message-1', role: 'assistant' } })),
      ...normalizer.normalize(event('message.part.updated', {
        part: {
          id: 'tool-part-1',
          type: 'tool',
          callID: 'tool-call-1',
          tool: 'read',
          state: { input: { file_path: '/tmp/a.txt' } },
        },
      })),
      ...normalizer.normalize(event('message.part.updated', {
        part: {
          id: 'tool-part-1',
          type: 'tool',
          callID: 'tool-call-1',
          tool: 'read',
          state: { status: 'completed', input: { file_path: '/tmp/a.txt' }, output: 'file text' },
        },
      })),
    ]

    const assistantIndex = frames.findIndex(frame => frame?.type === 'assistant')
    const resultIndex = frames.findIndex(frame => frame?.type === 'user')

    expect(assistantIndex).toBeGreaterThan(-1)
    expect(resultIndex).toBeGreaterThan(-1)
    expect(assistantIndex).toBeLessThan(resultIndex)
    expect(frames[assistantIndex]).toMatchObject({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tool-call-1', name: 'Read', input: { file_path: '/tmp/a.txt' } },
        ],
      },
    })
  })
})
```

- [ ] **步骤 2：验证 RED**

运行：

```bash
npm run test:unit -- tests/unit/services/agent/mimo/event-normalizer.test.ts
```

预期：失败，因为工具输入 delta 和助手聚合缺失。

---

## 任务 2：修复 MiMo 工具协议帧

**文件：**
- 修改：`src/main/services/agent/mimo/event-normalizer.ts`
- 测试：`tests/unit/services/agent/mimo/event-normalizer.test.ts`

- [ ] **步骤 1：通过 `input_json_delta` 发出工具输入**

当工具部分开始时，发出带有空 `input: {}` 的块开始。然后当输入可用且与已发出的输入不同时，发出 `input_json_delta` 帧。

- [ ] **步骤 2：在工具结果之前发出助手聚合**

当工具部分完成或出错时，在匹配的 `user.tool_result` 之前发出：

```ts
{
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [
      { type: 'tool_use', id: callId, name: mappedName, input },
    ],
  },
}
```

- [ ] **步骤 3：验证 GREEN**

运行：

```bash
npm run test:unit -- tests/unit/services/agent/mimo/event-normalizer.test.ts
```

预期：所有测试通过。

---

## 任务 3：添加提示失败测试

**文件：**
- 修改：`tests/unit/services/agent/mimo/session-adapter-fallback.test.ts`
- 测试目标：`src/main/services/agent/mimo/session-adapter.ts`

- [ ] **步骤 1：编写失败测试**

添加一个测试，mock `fetch` 返回 502 并断言最终帧是错误结果：

```ts
it('emits an error result when the prompt endpoint fails', async () => {
  subscribeMock.mockRejectedValueOnce(new Error('subscription unavailable'))
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status: 502,
    text: async () => 'Bad Gateway',
  } as Response)

  const { MimoSession } = await import('../../../../../src/main/services/agent/mimo/session-adapter')
  const session = await MimoSession.create({ model: 'mimo-test-model' })

  session.send('hello')

  const frames: any[] = []
  for await (const frame of session.stream()) {
    frames.push(frame)
  }

  expect(frames[frames.length - 1]).toMatchObject({
    type: 'result',
    subtype: 'error',
  })
  expect(frames[frames.length - 1].error.message).toContain('502')

  await session.close()
})
```

- [ ] **步骤 2：验证 RED**

运行：

```bash
npm run test:unit -- tests/unit/services/agent/mimo/session-adapter-fallback.test.ts
```

预期：失败，因为提示错误当前以成功方式结束。

---

## 任务 4：修复提示错误结果处理

**文件：**
- 修改：`src/main/services/agent/mimo/session-adapter.ts`
- 仅在结果形状需要调整时修改：`src/main/services/agent/mimo/event-normalizer.ts`
- 测试：`tests/unit/services/agent/mimo/session-adapter-fallback.test.ts`

- [ ] **步骤 1：添加显式完成状态**

修改 `finishTurn()` 接受可选的错误消息，并在失败时调用 `normalizer.createResult(true, message)`。

- [ ] **步骤 2：从提示失败路径使用错误完成**

在 `send()` 的 catch 处理程序中，调用错误完成路径而非成功完成路径。

- [ ] **步骤 3：保持 SSE 失败为非致命**

SSE 订阅失败应记录日志并允许 HTTP 回退。只有提示失败应产生失败的轮次。

- [ ] **步骤 4：验证 GREEN**

运行：

```bash
npm run test:unit -- tests/unit/services/agent/mimo/session-adapter-fallback.test.ts
```

预期：提示 502 返回错误结果。

---

## 任务 5：隔离 MiMo 技能上下文

**文件：**
- 创建：`src/main/services/agent/mimo/skill-context.ts`
- 修改：`src/main/services/agent/mimo/session-adapter.ts`
- 修改：`src/main/services/agent/sdk-config.ts`
- 修改使用 `getSkillContent` mock 的测试

- [ ] **步骤 1：将技能发现移至 MiMo 模块**

创建 MiMo 本地函数：

```ts
export function getMimoInstalledSkills(): string[]
export function getMimoSkillContent(skillName: string): string | null
```

它们应使用 `resolveClaudeConfigDir()` 并读取 `$CLAUDE_CONFIG_DIR/skills/<skill>/SKILL.md`。

- [ ] **步骤 2：在适配器中使用 MiMo 本地技能上下文**

`MimoSession` 应在启动时调用 `getMimoInstalledSkills()`，在命令注册和斜杠回退时调用 `getMimoSkillContent()`。

- [ ] **步骤 3：移除共享的 `_installedSkills` 注入**

从 `buildBaseSdkOptions()` 中删除 `sdkOptions._installedSkills = getInstalledSkills()`。

- [ ] **步骤 4：验证聚焦测试**

运行：

```bash
npm run test:unit -- tests/unit/services/agent/mimo/session-adapter-fallback.test.ts tests/unit/services/agent/sdk-config-runtime-limits.test.ts
```

预期：测试在没有共享 MiMo 私有字段的情况下通过。

---

## 任务 6：停止共享预热将每个命令分类为技能

**文件：**
- 修改：`src/main/services/agent/session-manager.ts`

- [ ] **步骤 1：更改共享会话信息发出**

替换：

```ts
skills: slashCommands
```

为仅在可用时使用命令提供的技能，否则为 `[]`。

- [ ] **步骤 2：保留来自适配器的 MiMo 技能**

如果 MiMo 需要在预热中包含技能，从 `MimoSession.query.supportedCommands()` 返回带有标记字段的结构化命令对象，然后仅将标记的条目映射为技能。

- [ ] **步骤 3：验证无非 MiMo 回退**

运行：

```bash
npm run test:unit -- tests/unit/services/agent/codex/session-adapter-shape.test.ts
```

预期：Codex 支持的命令行为保持不变。

---

## 任务 7：最终验证

**文件：**
- 所有涉及的文件

- [ ] **步骤 1：运行 MiMo 聚焦测试**

```bash
npm run test:unit -- tests/unit/services/agent/mimo
```

预期：所有 MiMo 测试通过。

- [ ] **步骤 2：运行代理聚焦测试**

```bash
npm run test:unit -- tests/unit/services/agent
```

预期：所有代理测试通过，或仅记录已知的无关失败。

- [ ] **步骤 3：运行构建**

```bash
npm run build
```

预期：构建完成。

- [ ] **步骤 4：手动验证**

1. 选择 MiMo Code 引擎。
2. 发送一个产生推理的提示。
3. 确认思考在执行过程中出现。
4. 确认思考面板可以在执行期间展开。
5. 确认已完成的思考在执行后仍然可用。
6. 复现提示 502 并确认 UI 显示失败轮次而非空的成功回复。

---

## 自检

- 规范覆盖：方案涵盖了协议排序、工具输入 delta、助手聚合、提示错误、技能上下文边界、支持的命令回退和思考流验证。
- 占位符扫描：没有剩余的占位符实现任务。
- 类型一致性：文件名和方法职责与当前代理/MiMo 模块结构匹配。
