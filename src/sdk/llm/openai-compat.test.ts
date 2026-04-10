/**
 * Unit tests for openai-compat.ts
 *
 * Covers:
 * - Request building (toOpenAiMessages: string/block content, system prompt, tools)
 * - Non-streaming response parsing (text, tool_calls, usage, finish_reason)
 * - Streaming event sequence (text, tool calls, reasoning, think-tag parsing)
 * - Provider quirks (toolIdMaxLen, toolIdAlphanumericOnly, fixToolUserSequence,
 *   includeUsageInStream, reasoningField, defaultTemperature)
 * - Error handling (HTTP errors, retries, abort)
 * - listModels / healthCheck
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAiCompatProvider } from './openai-compat.js';
import type { ProviderRequest, Message, ContentBlock, TextBlock, ToolUseBlock, ToolResultBlock } from '../types/provider.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvider(overrides: Partial<ConstructorParameters<typeof OpenAiCompatProvider>[0]> = {}) {
  return new OpenAiCompatProvider({
    id: 'test',
    name: 'Test Provider',
    baseUrl: 'https://api.test.com/v1',
    apiKey: 'test-key',
    defaultModel: 'gpt-test',
    ...overrides,
  });
}

/** Build a mock non-streaming JSON response. */
function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Build a mock SSE streaming response from data lines. */
function makeSseResponse(lines: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const data = lines.join('') + 'data: [DONE]\n\n';
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(data));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/** Encode a single SSE data line. */
function sseData(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/** Collect all events from an async generator. */
async function collectStream<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const events: T[] = [];
  for await (const evt of gen) {
    events.push(evt);
  }
  return events;
}

/** Base request used by most tests. */
function baseRequest(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    model: 'gpt-test',
    messages: [],
    maxTokens: 1024,
    tools: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// capabilities()
// ---------------------------------------------------------------------------

describe('capabilities()', () => {
  it('returns expected defaults without reasoningField', () => {
    const provider = makeProvider();
    const caps = provider.capabilities();
    expect(caps.streaming).toBe(true);
    expect(caps.toolCalling).toBe(true);
    expect(caps.thinking).toBe(false);
    expect(caps.imageInput).toBe(true);
    expect(caps.pdfInput).toBe(false);
    expect(caps.systemPromptStyle).toBe('system_message');
  });

  it('sets thinking=true when reasoningField quirk is set', () => {
    const provider = makeProvider({ quirks: { reasoningField: 'reasoning_content' } });
    expect(provider.capabilities().thinking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Non-streaming: createMessage
// ---------------------------------------------------------------------------

describe('createMessage()', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds correct request body with text-only response', async () => {
    const responseBody = {
      id: 'chatcmpl-1',
      model: 'gpt-test',
      choices: [{ message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    };
    fetchMock.mockResolvedValue(makeJsonResponse(responseBody));

    const provider = makeProvider();
    const result = await provider.createMessage(baseRequest({
      messages: [{ role: 'user', content: 'Hi' }],
    }));

    expect(result.id).toBe('chatcmpl-1');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({ type: 'text', text: 'Hello!' });
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 5 });

    // Verify the outgoing request body
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test.com/v1/chat/completions');
    const body = JSON.parse(options.body as string);
    expect(body.model).toBe('gpt-test');
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(1024);
    expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('sends Authorization header with API key', async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({
      id: 'x', model: 'gpt-test',
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: {},
    }));

    await makeProvider().createMessage(baseRequest());

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-key');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('parses tool_calls from non-streaming response', async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({
      id: 'c1', model: 'gpt-test',
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_abc',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 20, completion_tokens: 8 },
    }));

    const result = await makeProvider().createMessage(baseRequest());

    expect(result.stopReason).toBe('tool_use');
    const toolBlock = result.content.find(b => b.type === 'tool_use') as ToolUseBlock;
    expect(toolBlock).toBeDefined();
    expect(toolBlock.name).toBe('get_weather');
    expect(toolBlock.id).toBe('call_abc');
    expect(toolBlock.input).toEqual({ city: 'Tokyo' });
  });

  it('maps finish_reason: length → max_tokens', async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({
      id: 'c2', model: 'gpt-test',
      choices: [{ message: { content: 'truncated' }, finish_reason: 'length' }],
      usage: {},
    }));
    const result = await makeProvider().createMessage(baseRequest());
    expect(result.stopReason).toBe('max_tokens');
  });

  it('maps finish_reason: content_filter → content_filtered', async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({
      id: 'c3', model: 'gpt-test',
      choices: [{ message: { content: '' }, finish_reason: 'content_filter' }],
      usage: {},
    }));
    const result = await makeProvider().createMessage(baseRequest());
    expect(result.stopReason).toBe('content_filtered');
  });

  it('includes tools in request body', async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({
      id: 'x', model: 'gpt-test',
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: {},
    }));

    await makeProvider().createMessage(baseRequest({
      tools: [{ name: 'search', description: 'Search the web', input_schema: { type: 'object', properties: {} } }],
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toMatchObject({
      type: 'function',
      function: { name: 'search', description: 'Search the web' },
    });
  });

  it('includes temperature when specified', async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({
      id: 'x', model: 'gpt-test',
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: {},
    }));

    await makeProvider().createMessage(baseRequest({ temperature: 0.7 }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.7);
  });

  it('falls back to defaultTemperature quirk when no temperature in request', async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({
      id: 'x', model: 'gpt-test',
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: {},
    }));

    const provider = makeProvider({ quirks: { defaultTemperature: 0.0 } });
    await provider.createMessage(baseRequest());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.0);
  });

  it('passes reasoning_effort from providerOptions', async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({
      id: 'x', model: 'gpt-test',
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: {},
    }));

    await makeProvider().createMessage(baseRequest({
      providerOptions: { reasoning_effort: 'high' },
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.reasoning_effort).toBe('high');
  });

  it('throws on 4xx non-retryable error', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'Invalid API key' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    ));

    const provider = makeProvider();
    await expect(provider.createMessage(baseRequest())).rejects.toThrow(/Invalid API key/);
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    const okResponse = makeJsonResponse({
      id: 'x', model: 'gpt-test',
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: {},
    });
    fetchMock
      .mockResolvedValueOnce(new Response('rate limited', { status: 429, headers: {} }))
      .mockResolvedValueOnce(okResponse);

    const provider = makeProvider();
    const result = await provider.createMessage(baseRequest());
    expect(result.content[0]).toMatchObject({ type: 'text', text: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fills empty content with placeholder text block', async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({
      id: 'x', model: 'gpt-test',
      choices: [{ message: { role: 'assistant', content: null }, finish_reason: 'stop' }],
      usage: {},
    }));

    const result = await makeProvider().createMessage(baseRequest());
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({ type: 'text', text: '' });
  });
});

// ---------------------------------------------------------------------------
// Streaming: createMessageStream
// ---------------------------------------------------------------------------

describe('createMessageStream()', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('yields message_start, text deltas, and message_stop for basic text response', async () => {
    const chunks = [
      sseData({ id: 'c1', model: 'gpt-test', choices: [{ delta: { role: 'assistant', content: '' }, finish_reason: null }], usage: null }),
      sseData({ choices: [{ delta: { content: 'Hello' }, finish_reason: null }] }),
      sseData({ choices: [{ delta: { content: ' World' }, finish_reason: null }] }),
      sseData({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
    ];
    fetchMock.mockResolvedValue(makeSseResponse(chunks));

    const provider = makeProvider();
    const events = await collectStream(provider.createMessageStream(baseRequest()));

    const types = events.map(e => e.type);
    expect(types).toContain('message_start');
    expect(types).toContain('text_delta');
    expect(types).toContain('message_stop');

    const textEvents = events.filter(e => e.type === 'text_delta');
    const text = textEvents.map((e: any) => e.text).join('');
    expect(text).toBe('Hello World');
  });

  it('yields content_block_start for tool calls and input_json_delta fragments', async () => {
    const chunks = [
      sseData({ id: 'c2', model: 'gpt-test', choices: [{ delta: { role: 'assistant' }, finish_reason: null }] }),
      sseData({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_x', type: 'function', function: { name: 'search', arguments: '' } }] }, finish_reason: null }] }),
      sseData({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"q":' } }] }, finish_reason: null }] }),
      sseData({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"cats"}' } }] }, finish_reason: null }] }),
      sseData({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
    ];
    fetchMock.mockResolvedValue(makeSseResponse(chunks));

    const events = await collectStream(makeProvider().createMessageStream(baseRequest()));

    const blockStart = events.find((e: any) => e.type === 'content_block_start' && e.content_block?.type === 'tool_use') as any;
    expect(blockStart).toBeDefined();
    expect(blockStart.content_block.name).toBe('search');

    const jsonDeltas = events.filter(e => e.type === 'input_json_delta') as any[];
    const assembled = jsonDeltas.map(e => e.partialJson).join('');
    expect(assembled).toBe('{"q":"cats"}');
  });

  it('yields reasoning_delta events for reasoning_content field', async () => {
    const chunks = [
      sseData({ id: 'r1', model: 'gpt-test', choices: [{ delta: { role: 'assistant' }, finish_reason: null }] }),
      sseData({ choices: [{ delta: { reasoning_content: 'Let me think...' }, finish_reason: null }] }),
      sseData({ choices: [{ delta: { content: 'Answer.' }, finish_reason: null }] }),
      sseData({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValue(makeSseResponse(chunks));

    const provider = makeProvider({ quirks: { reasoningField: 'reasoning_content' } });
    const events = await collectStream(provider.createMessageStream(baseRequest({ model: 'gpt-test' })));

    const reasoningEvt = events.find(e => e.type === 'reasoning_delta') as any;
    expect(reasoningEvt).toBeDefined();
    expect(reasoningEvt.reasoning).toBe('Let me think...');

    // Should also emit content_block_start for thinking
    const thinkingBlockStart = events.find(
      (e: any) => e.type === 'content_block_start' && e.content_block?.type === 'thinking'
    );
    expect(thinkingBlockStart).toBeDefined();
  });

  it('parses Qwen <think> XML tags via ThinkTagParser', async () => {
    const qwenModel = 'qwen-plus-2025-01-25';
    const chunks = [
      sseData({ id: 'q1', model: qwenModel, choices: [{ delta: { role: 'assistant' }, finish_reason: null }] }),
      sseData({ choices: [{ delta: { content: '<think>reason</think>answer' }, finish_reason: null }] }),
      sseData({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValue(makeSseResponse(chunks));

    const provider = makeProvider();
    const events = await collectStream(provider.createMessageStream(baseRequest({ model: qwenModel })));

    const reasoningDeltas = events.filter(e => e.type === 'reasoning_delta') as any[];
    expect(reasoningDeltas.length).toBeGreaterThan(0);
    expect(reasoningDeltas.map((e: any) => e.reasoning).join('')).toBe('reason');

    const textDeltas = events.filter(e => e.type === 'text_delta') as any[];
    expect(textDeltas.map((e: any) => e.text).join('')).toBe('answer');
  });

  it('parses GLM <think> XML tags via ThinkTagParser', async () => {
    const glmModel = 'glm-z1-plus';
    const chunks = [
      sseData({ id: 'g1', model: glmModel, choices: [{ delta: { role: 'assistant' }, finish_reason: null }] }),
      sseData({ choices: [{ delta: { content: '<think>GLM reasoning</think>Final.' }, finish_reason: null }] }),
      sseData({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValue(makeSseResponse(chunks));

    const provider = makeProvider();
    const events = await collectStream(provider.createMessageStream(baseRequest({ model: glmModel })));

    const reasoningDeltas = events.filter(e => e.type === 'reasoning_delta') as any[];
    expect(reasoningDeltas.map((e: any) => e.reasoning).join('')).toBe('GLM reasoning');

    const textDeltas = events.filter(e => e.type === 'text_delta') as any[];
    expect(textDeltas.map((e: any) => e.text).join('')).toBe('Final.');
  });

  it('handles usage-only chunk without choices', async () => {
    const chunks = [
      sseData({ id: 'u1', model: 'gpt-test', choices: [{ delta: { content: 'Hi' }, finish_reason: null }] }),
      sseData({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      sseData({ usage: { prompt_tokens: 10, completion_tokens: 3 } }),
    ];
    fetchMock.mockResolvedValue(makeSseResponse(chunks));

    const events = await collectStream(makeProvider().createMessageStream(baseRequest()));
    // Should not throw — usage-only chunk emits message_delta
    const usageEvents = events.filter(e => e.type === 'message_delta') as any[];
    // At least the finish_reason one
    expect(usageEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('includes stream_options when includeUsageInStream quirk is set', async () => {
    const chunks = [
      sseData({ id: 'x', model: 'gpt-test', choices: [{ delta: {}, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValue(makeSseResponse(chunks));

    const provider = makeProvider({ quirks: { includeUsageInStream: true } });
    await collectStream(provider.createMessageStream(baseRequest()));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it('throws on 4xx error during streaming', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'Unauthorized' } }),
      { status: 401 },
    ));

    const provider = makeProvider();
    await expect(collectStream(provider.createMessageStream(baseRequest()))).rejects.toThrow(/401/);
  });

  it('retries connection on 503 and succeeds', async () => {
    const okChunks = [
      sseData({ id: 'x', model: 'gpt-test', choices: [{ delta: { content: 'ok' }, finish_reason: null }] }),
      sseData({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
    ];
    fetchMock
      .mockResolvedValueOnce(new Response('service unavailable', { status: 503 }))
      .mockResolvedValueOnce(makeSseResponse(okChunks));

    const provider = makeProvider();
    const events = await collectStream(provider.createMessageStream(baseRequest()));
    expect(events.some(e => e.type === 'text_delta')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Message conversion: toOpenAiMessages
// ---------------------------------------------------------------------------

describe('toOpenAiMessages via createMessage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  /** Return a fresh Response on every call (body can only be read once). */
  const okResponseFactory = () => makeJsonResponse({
    id: 'x', model: 'gpt-test',
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    usage: {},
  });

  beforeEach(() => {
    fetchMock = vi.fn();
    fetchMock.mockImplementation(() => Promise.resolve(okResponseFactory()));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converts string message content directly', async () => {

    await makeProvider().createMessage(baseRequest({
      messages: [{ role: 'user', content: 'Hello' }],
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toContainEqual({ role: 'user', content: 'Hello' });
  });

  it('injects system prompt as first message', async () => {

    await makeProvider().createMessage(baseRequest({
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user', content: 'Hi' }],
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
  });

  it('concatenates system prompt blocks with double newline', async () => {

    await makeProvider().createMessage(baseRequest({
      systemPrompt: [{ type: 'text', text: 'Block one.' }, { type: 'text', text: 'Block two.' }],
      messages: [{ role: 'user', content: 'Hi' }],
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toBe('Block one.\n\nBlock two.');
  });

  it('maps assistant tool_use blocks to tool_calls', async () => {

    const messages: Message[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me search.' } as TextBlock,
          { type: 'tool_use', id: 'call_1', name: 'search', input: { q: 'cats' } } as ToolUseBlock,
        ],
      },
    ];

    await makeProvider().createMessage(baseRequest({ messages }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const assistantMsg = body.messages[0];
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.content).toBe('Let me search.');
    expect(assistantMsg.tool_calls).toHaveLength(1);
    expect(assistantMsg.tool_calls[0]).toMatchObject({
      id: 'call_1',
      type: 'function',
      function: { name: 'search', arguments: '{"q":"cats"}' },
    });
  });

  it('maps tool_result blocks to separate tool messages', async () => {

    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call_1', content: 'Result text' } as ToolResultBlock,
        ],
      },
    ];

    await makeProvider().createMessage(baseRequest({ messages }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolMsg = body.messages.find((m: any) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg.tool_call_id).toBe('call_1');
    expect(toolMsg.content).toBe('Result text');
  });

  it('maps tool_result with ContentBlock[] content to joined text', async () => {

    const messages: Message[] = [
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_2',
            content: [{ type: 'text', text: 'Part A' }, { type: 'text', text: 'Part B' }],
          } as ToolResultBlock,
        ],
      },
    ];

    await makeProvider().createMessage(baseRequest({ messages }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolMsg = body.messages.find((m: any) => m.role === 'tool');
    expect(toolMsg.content).toBe('Part A\nPart B');
  });

  it('maps image blocks to image_url format', async () => {

    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this:' } as TextBlock,
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } } as ContentBlock,
        ],
      },
    ];

    await makeProvider().createMessage(baseRequest({ messages }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMsg = body.messages.find((m: any) => m.role === 'user');
    expect(Array.isArray(userMsg.content)).toBe(true);
    const imgBlock = userMsg.content.find((b: any) => b.type === 'image_url');
    expect(imgBlock.image_url.url).toBe('data:image/png;base64,abc123');
  });
});

// ---------------------------------------------------------------------------
// Quirks
// ---------------------------------------------------------------------------

describe('provider quirks', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const okResponseFactory = () => makeJsonResponse({
    id: 'x', model: 'gpt-test',
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    usage: {},
  });

  beforeEach(() => {
    fetchMock = vi.fn();
    fetchMock.mockImplementation(() => Promise.resolve(okResponseFactory()));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('toolIdMaxLen truncates and pads tool call IDs', async () => {

    const provider = makeProvider({ quirks: { toolIdMaxLen: 6 } });
    const messages: Message[] = [{
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'call_very_long_id_123', name: 'fn', input: {} } as ToolUseBlock],
    }];

    await provider.createMessage(baseRequest({ messages }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const tc = body.messages[0].tool_calls[0];
    expect(tc.id).toHaveLength(6);
    expect(tc.id).toBe('call_v'); // first 6 chars, pad with 0 if shorter (here exact length)
  });

  it('toolIdAlphanumericOnly strips non-alphanumeric chars', async () => {

    const provider = makeProvider({ quirks: { toolIdAlphanumericOnly: true } });
    const messages: Message[] = [{
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'call-xyz_123!', name: 'fn', input: {} } as ToolUseBlock],
    }];

    await provider.createMessage(baseRequest({ messages }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const tc = body.messages[0].tool_calls[0];
    expect(tc.id).toBe('callxyz123');
  });

  it('fixToolUserSequence inserts assistant:Done between tool→user', async () => {

    const provider = makeProvider({ quirks: { fixToolUserSequence: true } });
    const messages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'result' } as ToolResultBlock],
      },
      { role: 'user', content: 'Follow-up question' },
    ];

    await provider.createMessage(baseRequest({ messages }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // Find the injected assistant message
    const assistantDone = body.messages.find((m: any) => m.role === 'assistant' && m.content === 'Done.');
    expect(assistantDone).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// listModels()
// ---------------------------------------------------------------------------

describe('listModels()', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed model list on success', async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({
      data: [
        { id: 'gpt-4o', object: 'model' },
        { id: 'gpt-3.5-turbo', object: 'model' },
      ],
    }));

    const models = await makeProvider().listModels();
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe('gpt-4o');
    expect(models[0].providerId).toBe('test');
    expect(typeof models[0].contextWindow).toBe('number');
  });

  it('returns empty array on HTTP error', async () => {
    fetchMock.mockResolvedValue(new Response('error', { status: 500 }));
    const models = await makeProvider().listModels();
    expect(models).toEqual([]);
  });

  it('returns empty array on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'));
    const models = await makeProvider().listModels();
    expect(models).toEqual([]);
  });

  it('filters out entries without id field', async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({
      data: [{ id: 'gpt-4' }, { object: 'model' /* no id */ }],
    }));
    const models = await makeProvider().listModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('gpt-4');
  });
});

// ---------------------------------------------------------------------------
// healthCheck()
// ---------------------------------------------------------------------------

describe('healthCheck()', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns healthy when /models responds 200', async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({ data: [] }));
    const status = await makeProvider().healthCheck();
    expect(status.status).toBe('healthy');
  });

  it('returns unavailable when no API key for remote provider', async () => {
    const provider = makeProvider({ apiKey: undefined });
    const status = await provider.healthCheck();
    expect(status.status).toBe('unavailable');
    expect(status.reason).toMatch(/API key/);
    // Should not attempt a network call
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns unavailable on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('Connection refused'));
    const status = await makeProvider().healthCheck();
    expect(status.status).toBe('unavailable');
    expect(status.reason).toContain('Connection refused');
  });

  it('allows localhost provider without API key', async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({ data: [] }));
    const provider = makeProvider({ baseUrl: 'http://localhost:11434/v1', apiKey: undefined });
    const status = await provider.healthCheck();
    // Should actually make the request (no early return for no-api-key check)
    expect(fetchMock).toHaveBeenCalled();
    expect(status.status).toBe('healthy');
  });
});
