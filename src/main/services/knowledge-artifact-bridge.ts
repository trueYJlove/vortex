/**
 * Knowledge-Artifact Bridge
 *
 * Subscribes to artifact change events from the file watcher and
 * automatically indexes supported files into the knowledge base.
 *
 * This connects the services tier (artifact-cache.service) with the
 * platform tier (KnowledgeService) without circular dependencies.
 *
 * Event handling:
 *   add / change → debounced re-index
 *   unlink       → remove the document from the knowledge base
 *
 * Directory events (addDir, unlinkDir) are ignored. Rapid duplicate
 * events are debounced per file path.
 */

import { extname } from 'path'
import { getKnowledgeService } from '../platform/memory'
import { subscribeToArtifactChanges } from './artifact.service'
import type { ArtifactChangeEvent } from './artifact.service'

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv', '.pdf'])

// Debounce: minimum interval between re-indexing the same file (ms).
// 500ms matches the design spec — short enough to feel responsive,
// long enough to coalesce a burst of rapid writes.
const DEBOUNCE_MS = 500

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Handle a single artifact change event.
 *
 * add / change events are debounced per file path: if the same file
 * changes rapidly, only the last event within the window triggers an
 * index. unlink events are processed immediately (no debounce) so the
 * index does not retain stale entries.
 */
function handleArtifactEvent(event: ArtifactChangeEvent): void {
  // Directory events are not applicable — skip.
  if (event.type === 'addDir' || event.type === 'unlinkDir') return

  const ext = extname(event.path).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(ext)) return

  // Deletions: cancel any pending index and remove the document
  // immediately so the knowledge base does not retain stale entries.
  if (event.type === 'unlink') {
    const existing = pendingTimers.get(event.path)
    if (existing) {
      clearTimeout(existing)
      pendingTimers.delete(event.path)
    }
    doRemove(event.path, event.spaceId)
    return
  }

  // add / change: debounce per path
  const existing = pendingTimers.get(event.path)
  if (existing) {
    clearTimeout(existing)
  }

  pendingTimers.set(
    event.path,
    setTimeout(() => {
      pendingTimers.delete(event.path)
      doIndex(event.path, event.spaceId)
    }, DEBOUNCE_MS),
  )
}

async function doIndex(filePath: string, spaceId: string): Promise<void> {
  const svc = getKnowledgeService()
  if (!svc) {
    console.warn('[KnowledgeBridge] KnowledgeService not initialized, skipping artifact index')
    return
  }

  try {
    await svc.indexArtifact(spaceId, filePath)
  } catch (err) {
    console.warn('[KnowledgeBridge] Failed to index artifact:', err instanceof Error ? err.message : err)
  }
}

async function doRemove(filePath: string, spaceId: string): Promise<void> {
  const svc = getKnowledgeService()
  if (!svc) {
    return
  }

  try {
    await svc.removeDocument(spaceId, filePath)
    console.log(`[KnowledgeBridge] Removed deleted artifact from index: ${filePath}`)
  } catch (err) {
    console.warn('[KnowledgeBridge] Failed to remove artifact from index:', err instanceof Error ? err.message : err)
  }
}

/**
 * Start the bridge: subscribe to artifact change events.
 * Returns an unsubscribe function for cleanup.
 */
export function startKnowledgeArtifactBridge(): () => void {
  console.log('[KnowledgeBridge] Starting knowledge-artifact bridge')

  const unsubscribe = subscribeToArtifactChanges(handleArtifactEvent)

  return () => {
    console.log('[KnowledgeBridge] Stopping knowledge-artifact bridge')
    // Cancel all pending debounce timers
    for (const [path, timer] of Array.from(pendingTimers.entries())) {
      clearTimeout(timer)
    }
    pendingTimers.clear()
    unsubscribe()
  }
}