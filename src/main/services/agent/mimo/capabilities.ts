import type { EngineCapabilities } from '../capabilities'

export const MIMO_CAPABILITIES: EngineCapabilities = {
  engineId: 'mimo',
  displayName: 'MiMo Code',
  streaming: {
    text: 'token',
    reasoning: 'token',
    toolInput: 'final-only',
    toolOutput: 'item',
  },
  tools: {
    native: ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob', 'Mcp'],
    synthetic: [],
    shellHeuristics: false,
  },
  todo: { states: ['pending', 'in_progress', 'completed'], hasActiveForm: false },
  subAgent: { model: 'imperative', visibleLifecycle: false },
  features: {
    skills: true,
    mcp: true,
    hooks: false,
    sessionResume: true,
    midTurnInjection: false,
    interrupt: false,
    multimodalImage: false,
    contextCompaction: true,
    askUserQuestion: true,
  },
}
