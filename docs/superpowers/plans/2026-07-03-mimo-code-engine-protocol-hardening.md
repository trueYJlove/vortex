# MiMo Code Engine Protocol Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the MiMo Code engine adapter with Halo's Claude Code-compatible agent protocol so thinking, tool calls, tool results, and failures stream correctly without regressing existing engines.

**Architecture:** MiMo-specific event normalization stays under `src/main/services/agent/mimo/`. Shared agent consumers remain engine-agnostic; engine-specific command and skill handling is normalized before reaching `session-consumer.ts` or `stream-processor.ts`.

**Tech Stack:** Electron main process, TypeScript, Vitest, Halo agent service, MiMo SDK v2 SSE stream.

---

## File Structure

- Modify: `src/main/services/agent/mimo/event-normalizer.ts`
  - Owns MiMo native event to Halo/Claude stream frame translation.
  - Must emit `input_json_delta` for tool input and assistant aggregate frames before tool results.
- Modify: `src/main/services/agent/mimo/session-adapter.ts`
  - Owns MiMo session lifecycle, SSE subscription, HTTP prompt fallback, and error result emission.
  - Must not rely on shared `sdk-config.ts` for MiMo-private skill content.
- Create: `src/main/services/agent/mimo/skill-context.ts`
  - Owns MiMo-only skill discovery and skill file loading.
- Modify: `src/main/services/agent/sdk-config.ts`
  - Remove MiMo-only `_installedSkills` injection and exported MiMo skill reader.
- Modify: `src/main/services/agent/session-manager.ts`
  - Stop treating all supported commands as skills in the shared warm-up path.
- Create: `tests/unit/services/agent/mimo/event-normalizer.test.ts`
  - Protocol-level tests for thinking, text, tool input, assistant aggregate, tool result ordering.
- Modify: `tests/unit/services/agent/mimo/session-adapter-fallback.test.ts`
  - Add prompt failure test and update mocks to use MiMo-local skill context.

---

## Task 1: Add MiMo normalizer protocol tests

**Files:**
- Create: `tests/unit/services/agent/mimo/event-normalizer.test.ts`
- Test target: `src/main/services/agent/mimo/event-normalizer.ts`

- [ ] **Step 1: Write failing tests**

Add tests that assert:

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

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run test:unit -- tests/unit/services/agent/mimo/event-normalizer.test.ts
```

Expected: fails because tool input delta and assistant aggregate are missing.

---

## Task 2: Fix MiMo tool protocol frames

**Files:**
- Modify: `src/main/services/agent/mimo/event-normalizer.ts`
- Test: `tests/unit/services/agent/mimo/event-normalizer.test.ts`

- [ ] **Step 1: Emit tool input via `input_json_delta`**

When a tool part starts, emit block start with empty `input: {}`. Then emit an `input_json_delta` frame when input is available and different from the input already emitted.

- [ ] **Step 2: Emit assistant aggregate before tool result**

When a tool part completes or errors, emit:

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

before the matching `user.tool_result`.

- [ ] **Step 3: Verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/services/agent/mimo/event-normalizer.test.ts
```

Expected: all tests pass.

---

## Task 3: Add prompt failure test

**Files:**
- Modify: `tests/unit/services/agent/mimo/session-adapter-fallback.test.ts`
- Test target: `src/main/services/agent/mimo/session-adapter.ts`

- [ ] **Step 1: Write failing test**

Add a test that mocks `fetch` returning 502 and asserts the final frame is an error result:

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

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run test:unit -- tests/unit/services/agent/mimo/session-adapter-fallback.test.ts
```

Expected: fails because prompt errors currently finish as success.

---

## Task 4: Fix prompt error result handling

**Files:**
- Modify: `src/main/services/agent/mimo/session-adapter.ts`
- Modify: `src/main/services/agent/mimo/event-normalizer.ts` only if result shape needs adjustment
- Test: `tests/unit/services/agent/mimo/session-adapter-fallback.test.ts`

- [ ] **Step 1: Add explicit finish status**

Change `finishTurn()` to accept an optional error message and call `normalizer.createResult(true, message)` for failure.

- [ ] **Step 2: Use error finish from prompt failure path**

In `send()` catch handler, call the error finish path instead of the success finish path.

- [ ] **Step 3: Keep SSE failure non-fatal**

SSE subscription failure should log and allow HTTP fallback. Only prompt failure should produce a failed turn.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/services/agent/mimo/session-adapter-fallback.test.ts
```

Expected: prompt 502 returns an error result.

---

## Task 5: Isolate MiMo skill context

**Files:**
- Create: `src/main/services/agent/mimo/skill-context.ts`
- Modify: `src/main/services/agent/mimo/session-adapter.ts`
- Modify: `src/main/services/agent/sdk-config.ts`
- Modify tests that mock `getSkillContent`

- [ ] **Step 1: Move skill discovery to MiMo module**

Create MiMo-local functions:

```ts
export function getMimoInstalledSkills(): string[]
export function getMimoSkillContent(skillName: string): string | null
```

They should use `resolveClaudeConfigDir()` and read `$CLAUDE_CONFIG_DIR/skills/<skill>/SKILL.md`.

- [ ] **Step 2: Use MiMo-local skill context in adapter**

`MimoSession` should call `getMimoInstalledSkills()` during start and `getMimoSkillContent()` for command registration and slash fallback.

- [ ] **Step 3: Remove shared `_installedSkills` injection**

Delete `sdkOptions._installedSkills = getInstalledSkills()` from `buildBaseSdkOptions()`.

- [ ] **Step 4: Verify focused tests**

Run:

```bash
npm run test:unit -- tests/unit/services/agent/mimo/session-adapter-fallback.test.ts tests/unit/services/agent/sdk-config-runtime-limits.test.ts
```

Expected: tests pass without shared MiMo private fields.

---

## Task 6: Stop shared warm-up from classifying every command as a skill

**Files:**
- Modify: `src/main/services/agent/session-manager.ts`

- [ ] **Step 1: Change shared session-info emission**

Replace:

```ts
skills: slashCommands
```

with command-provided skills only when available, otherwise `[]`.

- [ ] **Step 2: Preserve MiMo skills from adapter**

If MiMo needs skills in warm-up, return structured command objects from `MimoSession.query.supportedCommands()` with a marker field, then map only those marked entries to skills.

- [ ] **Step 3: Verify no non-MiMo regression**

Run:

```bash
npm run test:unit -- tests/unit/services/agent/codex/session-adapter-shape.test.ts
```

Expected: Codex supported commands behavior remains unchanged.

---

## Task 7: Final verification

**Files:**
- All touched files

- [ ] **Step 1: Run MiMo focused tests**

```bash
npm run test:unit -- tests/unit/services/agent/mimo
```

Expected: all MiMo tests pass.

- [ ] **Step 2: Run agent focused tests**

```bash
npm run test:unit -- tests/unit/services/agent
```

Expected: all agent tests pass or only unrelated known failures are documented.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: build completes.

- [ ] **Step 4: Manual verification**

1. Select MiMo Code engine.
2. Send a prompt that produces reasoning.
3. Confirm thinking appears while execution is still running.
4. Confirm the thinking panel can be expanded during execution.
5. Confirm completed thinking remains available after execution.
6. Reproduce a prompt 502 and confirm UI shows a failed turn instead of an empty successful reply.

---

## Self-Review

- Spec coverage: The plan covers protocol ordering, tool input deltas, assistant aggregate, prompt errors, skill context boundaries, supported command regression, and thinking stream verification.
- Placeholder scan: No placeholder implementation tasks remain.
- Type consistency: File names and method responsibilities match the current agent/MiMo module structure.
