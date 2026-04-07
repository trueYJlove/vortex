/**
 * Agent Module - Generation Control
 *
 * Functions for controlling agent generation including:
 * - Stop/abort generation
 * - Check if generating
 * - Get active sessions
 * - Get session state for recovery
 */

import { activeSessions, v2Sessions, closeV2Session, getConsumerHandle } from './session-manager'
import { hasActiveTeamTasks } from './subagent-handler'
import type { Thought } from './types'

// ============================================
// Stop Generation
// ============================================

/**
 * Stop generation for a specific conversation or all conversations
 *
 * @param conversationId - Optional conversation ID. If not provided, stops all.
 */
export async function stopGeneration(conversationId?: string): Promise<void> {
  // Log caller stack trace for debugging spurious abort
  console.log(`[Agent] stopGeneration called, conversationId=${conversationId ?? 'ALL'}`, new Error('stopGeneration caller trace').stack)

  if (conversationId) {
    // Try consumer-based stop first (new REPL consumer model for chat conversations)
    const consumer = getConsumerHandle(conversationId)
    if (consumer && consumer.isRunning) {
      const sessionState = consumer.getActiveSessionState()
      const thoughts = sessionState?.thoughts || []

      const v2Session = v2Sessions.get(conversationId)
      if (v2Session && hasActiveTeamTasks(thoughts)) {
        // Team mode: close() kills the entire CC subprocess (main agent + all team members).
        // interrupt() + drain is insufficient because team agents run independently in the
        // same subprocess — interrupt only stops the current SDK turn, not the agents.
        console.log(`[Agent] Team active — closing V2 session (kills subprocess + all agents)`)
        try {
          v2Session.session.close()
        } catch (e) {
          console.error(`[Agent] Failed to close V2 session:`, e)
        }
        closeV2Session(conversationId)  // This also stops the consumer
      } else if (v2Session) {
        // Normal mode: interrupt current turn — consumer handles the drain via stream()
        try {
          await (v2Session.session as any).interrupt()
          console.log(`[Agent] V2 session interrupted (consumer handles drain)`)
        } catch (e) {
          console.error(`[Agent] Failed to interrupt V2 session:`, e)
        }
      }

      // Abort the current turn's AbortController
      if (sessionState) {
        sessionState.abortController.abort()
      }

      console.log(`[Agent] Stopped generation for conversation (consumer): ${conversationId}`)
      return
    }

    // Fallback: legacy activeSessions-based stop (for app-chat.ts / execute.ts)
    const session = activeSessions.get(conversationId)
    if (session) {
      session.abortController.abort()
      activeSessions.delete(conversationId)

      const v2Session = v2Sessions.get(conversationId)
      if (v2Session) {
        if (hasActiveTeamTasks(session.thoughts)) {
          console.log(`[Agent] Team active — closing V2 session (kills subprocess + all agents)`)
          try {
            v2Session.session.close()
          } catch (e) {
            console.error(`[Agent] Failed to close V2 session:`, e)
          }
          closeV2Session(conversationId)
        } else {
          // Normal mode: interrupt current turn and drain stale messages
          try {
            await (v2Session.session as any).interrupt()
            console.log(`[Agent] V2 session interrupted, draining stale messages...`)

            // Drain stale messages until we hit the result
            for await (const msg of v2Session.session.stream()) {
              console.log(`[Agent] Drained: ${msg.type}`)
              if (msg.type === 'result') break
            }
            console.log(`[Agent] Drain complete for: ${conversationId}`)
          } catch (e) {
            console.error(`[Agent] Failed to interrupt/drain V2 session:`, e)
          }
        }
      }

      console.log(`[Agent] Stopped generation for conversation: ${conversationId}`)
    }
  } else {
    // Stop all sessions: close() all V2 sessions to ensure clean termination
    // (safe for both team and non-team sessions)
    for (const [convId, session] of Array.from(activeSessions)) {
      session.abortController.abort()

      const v2Session = v2Sessions.get(convId)
      if (v2Session) {
        try {
          v2Session.session.close()
        } catch (e) {
          console.error(`[Agent] Failed to close V2 session ${convId}:`, e)
        }
        closeV2Session(convId)
      }

      console.log(`[Agent] Stopped generation for conversation: ${convId}`)
    }
    activeSessions.clear()

    // Also close all V2 sessions with consumers (chat conversations not in activeSessions)
    for (const convId of Array.from(v2Sessions.keys())) {
      closeV2Session(convId)  // This also stops consumers
    }

    console.log('[Agent] All generations stopped')
  }
}

// ============================================
// Generation Status
// ============================================

/**
 * Check if a conversation has an active generation.
 * Checks both consumer model (chat) and activeSessions (app-chat/execute).
 */
export function isGenerating(conversationId: string): boolean {
  // Check consumer model first (chat conversations)
  const consumer = getConsumerHandle(conversationId)
  if (consumer && consumer.isRunning && consumer.getActiveSessionState()) {
    return true
  }
  // Fallback: legacy activeSessions (app-chat.ts, execute.ts)
  return activeSessions.has(conversationId)
}

/**
 * Get all active session conversation IDs
 */
export function getActiveSessions(): string[] {
  return Array.from(activeSessions.keys())
}

// ============================================
// Session State Recovery
// ============================================

/**
 * Get current session state for a conversation (for recovery after refresh)
 *
 * This is used by remote clients to recover the current state when they
 * reconnect or refresh the page during an active generation.
 */
export function getSessionState(conversationId: string): {
  isActive: boolean
  thoughts: Thought[]
  spaceId?: string
} {
  // Check consumer model first (chat conversations)
  const consumer = getConsumerHandle(conversationId)
  if (consumer && consumer.isRunning) {
    const sessionState = consumer.getActiveSessionState()
    if (sessionState) {
      return {
        isActive: true,
        thoughts: [...sessionState.thoughts],
        spaceId: sessionState.spaceId
      }
    }
  }

  // Fallback: legacy activeSessions (app-chat.ts, execute.ts)
  const session = activeSessions.get(conversationId)
  if (!session) {
    return { isActive: false, thoughts: [] }
  }
  return {
    isActive: true,
    thoughts: [...session.thoughts],
    spaceId: session.spaceId
  }
}
