import { randomUUID } from 'crypto'

function streamEvent(event: any) {
  return { type: 'stream_event', event }
}

interface MiMoEvent {
  type: string
  properties: Record<string, any>
}

interface NormalizerState {
  sessionId: string
  model: string
  mcpServers: string[]
  slashCommands: string[]
  skills: string[]
  agents: string[]
  systemInitEmitted: boolean
  currentMessageId: string | null
  currentBlocks: Map<string, { type: string; name?: string; input?: any; text?: string; toolId?: string; emittedInputJson?: string; aggregateEmitted?: boolean }>
  tokenUsage: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
}

export class MimoEventNormalizer {
  private state: NormalizerState

  constructor(options: {
    sessionId: string
    model: string
    mcpServers?: string[]
    slashCommands?: string[]
    skills?: string[]
    agents?: string[]
  }) {
    this.state = {
      sessionId: options.sessionId,
      model: options.model,
      mcpServers: options.mcpServers ?? [],
      slashCommands: options.slashCommands ?? [],
      skills: options.skills ?? [],
      agents: options.agents ?? [],
      systemInitEmitted: false,
      currentMessageId: null,
      currentBlocks: new Map(),
      tokenUsage: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    }
  }

  reset(): void {
    this.state.systemInitEmitted = false
    this.state.currentMessageId = null
    this.state.currentBlocks.clear()
    this.state.tokenUsage = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
  }

  closeAllOpenBlocks(): any[] {
    const frames: any[] = []
    for (const [blockId] of this.state.currentBlocks) {
      frames.push(streamEvent({
        type: 'content_block_stop',
        index: this.getBlockIndex(blockId),
      }))
    }
    this.state.currentBlocks.clear()
    return frames
  }

  normalize(event: MiMoEvent): any[] {
    const frames: any[] = []

    if (!this.state.systemInitEmitted) {
      frames.push(this.createSystemInit())
      this.state.systemInitEmitted = true
    }

    switch (event.type) {
      case 'message.updated': {
        const info = event.properties.info
        if (!info) break
        if (info.role === 'assistant' && info.id !== this.state.currentMessageId) {
          this.state.currentMessageId = info.id
          frames.push(this.createMessageStart(info.id))
        }
        if (info.role === 'assistant' && info.tokens) {
          this.state.tokenUsage = {
            input: info.tokens.input ?? 0,
            output: info.tokens.output ?? 0,
            reasoning: info.tokens.reasoning ?? 0,
            cache: {
              read: info.tokens.cache?.read ?? 0,
              write: info.tokens.cache?.write ?? 0,
            },
          }
        }
        break
      }

      case 'message.part.updated': {
        const part = event.properties.part
        if (!part) break
        this.handlePartUpdated(part, frames)
        break
      }

      case 'message.part.delta': {
        const { partID, field, delta } = event.properties
        if (!partID || !field || !delta) break
        this.handlePartDelta(partID, field, delta, frames)
        break
      }

      case 'message.part.removed': {
        break
      }
    }

    return frames
  }

  createResult(isError?: boolean, errorMessage?: string): any {
    return {
      type: 'result',
      subtype: isError ? 'error' : 'success',
      session_id: this.state.sessionId,
      stop_reason: isError ? 'error' : 'end_turn',
      usage: {
        input_tokens: this.state.tokenUsage.input,
        output_tokens: this.state.tokenUsage.output,
        cache_read_input_tokens: this.state.tokenUsage.cache.read,
        cache_creation_input_tokens: this.state.tokenUsage.cache.write,
      },
      ...(errorMessage ? { error: { type: 'error', message: errorMessage } } : {}),
    }
  }

  createMessageDeltaAndStop(): any[] {
    const frames: any[] = []
    frames.push(streamEvent({
      type: 'message_delta',
      delta: {
        stop_reason: 'end_turn',
        usage: {
          output_tokens: this.state.tokenUsage.output,
        },
      },
    }))
    frames.push(streamEvent({
      type: 'message_stop',
    }))
    return frames
  }

  createSystemInit(): any {
    return {
      type: 'system',
      subtype: 'init',
      session_id: this.state.sessionId,
      model: this.state.model,
      tools: [],
      mcp_servers: this.state.mcpServers,
      slash_commands: this.state.slashCommands,
      skills: this.state.skills,
      agents: this.state.agents,
    }
  }

  createCompletePartFrames(part: any): any[] {
    const frames: any[] = []
    if (!part?.id || (part.type !== 'text' && part.type !== 'reasoning')) return frames

    this.handlePartUpdated(part, frames)
    const block = this.state.currentBlocks.get(part.id)
    if (!block) return frames

    const index = this.getBlockIndex(part.id)
    if (part.type === 'text' && part.text) {
      block.text = part.text
      frames.push(streamEvent({
        type: 'content_block_delta',
        index,
        delta: { type: 'text_delta', text: part.text },
      }))
    }

    frames.push(streamEvent({
      type: 'content_block_stop',
      index,
    }))
    this.state.currentBlocks.delete(part.id)
    return frames
  }

  private createMessageStart(messageId: string): any {
    return streamEvent({
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: this.state.model,
        stop_reason: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    })
  }

  private handlePartUpdated(part: any, frames: any[]): void {
    const partId = part.id
    const partType = part.type

    if (partType === 'text') {
      if (!this.state.currentBlocks.has(partId)) {
        this.state.currentBlocks.set(partId, { type: 'text' })
        frames.push(streamEvent({
          type: 'content_block_start',
          index: this.state.currentBlocks.size - 1,
          content_block: { type: 'text', text: '' },
        }))
      }
    } else if (partType === 'reasoning') {
      if (!this.state.currentBlocks.has(partId)) {
        this.state.currentBlocks.set(partId, { type: 'thinking', text: '' })
        frames.push(streamEvent({
          type: 'content_block_start',
          index: this.state.currentBlocks.size - 1,
          content_block: { type: 'thinking', thinking: '' },
        }))
      }
      // Emit thinking_delta for new/changed text from part.updated
      // This handles cases where MiMo sends full text in part.updated instead of deltas
      if (part.text) {
        const block = this.state.currentBlocks.get(partId)
        const prevText = block?.text ?? ''
        if (part.text !== prevText) {
          const newText = prevText ? part.text.slice(prevText.length) : part.text
          if (block) block.text = part.text
          if (newText) {
            frames.push(streamEvent({
              type: 'content_block_delta',
              index: this.getBlockIndex(partId),
              delta: { type: 'thinking_delta', thinking: newText },
            }))
          }
        }
      }
    } else if (partType === 'tool') {
      const callId = part.callID
      const toolName = this.mapToolName(part.tool)
      const input = part.state?.input ?? {}
      if (!this.state.currentBlocks.has(partId)) {
        this.state.currentBlocks.set(partId, { type: 'tool_use', name: toolName, input, toolId: callId })
        frames.push(streamEvent({
          type: 'content_block_start',
          index: this.state.currentBlocks.size - 1,
          content_block: {
            type: 'tool_use',
            id: callId,
            name: toolName,
            input: {},
          },
        }))
      }

      const block = this.state.currentBlocks.get(partId)
      if (block) {
        block.input = input
        block.name = toolName
        block.toolId = callId
        const inputJson = JSON.stringify(input)
        if (inputJson !== '{}' && inputJson !== block.emittedInputJson) {
          block.emittedInputJson = inputJson
          frames.push(streamEvent({
            type: 'content_block_delta',
            index: this.getBlockIndex(partId),
            delta: { type: 'input_json_delta', partial_json: inputJson },
          }))
        }
      }

      if (part.state?.status === 'completed' || part.state?.status === 'error') {
        frames.push(streamEvent({
          type: 'content_block_stop',
          index: this.getBlockIndex(partId),
        }))

        if (block && !block.aggregateEmitted) {
          block.aggregateEmitted = true
          frames.push({
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: callId,
                  name: toolName,
                  input,
                },
              ],
            },
          })
        }

        if (part.state.status === 'completed') {
          frames.push({
            type: 'user',
            message: {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: callId,
                  content: part.state.output ?? '',
                },
              ],
            },
          })
        } else {
          frames.push({
            type: 'user',
            message: {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: callId,
                  is_error: true,
                  content: part.state.error ?? 'Tool execution failed',
                },
              ],
            },
          })
        }
        this.state.currentBlocks.delete(partId)
      }
    } else if (partType === 'step-finish') {
      if (part.tokens) {
        this.state.tokenUsage = {
          input: part.tokens.input ?? 0,
          output: part.tokens.output ?? 0,
          reasoning: part.tokens.reasoning ?? 0,
          cache: {
            read: part.tokens.cache?.read ?? 0,
            write: part.tokens.cache?.write ?? 0,
          },
        }
      }
    }
  }

  private handlePartDelta(partId: string, field: string, delta: string, frames: any[]): void {
    const block = this.state.currentBlocks.get(partId)
    if (!block) return

    if (block.type === 'text' && field === 'text') {
      frames.push(streamEvent({
        type: 'content_block_delta',
        index: this.getBlockIndex(partId),
        delta: { type: 'text_delta', text: delta },
      }))
    } else if (block.type === 'thinking' && field === 'text') {
      block.text = (block.text ?? '') + delta
      frames.push(streamEvent({
        type: 'content_block_delta',
        index: this.getBlockIndex(partId),
        delta: { type: 'thinking_delta', thinking: delta },
      }))
    }
  }

  private getBlockIndex(partId: string): number {
    let index = 0
    for (const [id] of this.state.currentBlocks) {
      if (id === partId) return index
      index++
    }
    return index
  }

  private mapToolName(mimoTool: string): string {
    const mapping: Record<string, string> = {
      bash: 'Bash',
      read: 'Read',
      write: 'Write',
      edit: 'Edit',
      grep: 'Grep',
      glob: 'Glob',
      web_search: 'WebSearch',
      web_fetch: 'WebFetch',
      todowrite: 'TodoWrite',
      task: 'Task',
      skill: 'Skill',
      askuserquestion: 'AskUserQuestion',
      notebookedit: 'NotebookEdit',
    }
    const lower = mimoTool.toLowerCase()
    return mapping[lower] ?? mimoTool
  }
}
