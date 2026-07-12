/**
 * Unit tests: knowledge-artifact-bridge.ts
 *
 * Tests:
 * - Bridge registers artifact change listener on start
 * - Supported file types (.txt, .md, .json, .csv, .pdf) trigger indexArtifact
 * - Unsupported extensions (.png, .exe) are ignored
 * - Directory events (addDir, unlinkDir) are ignored
 * - unlink (delete) events trigger removeDocument (no debounce)
 * - indexArtifact is called lazily (getKnowledgeService at event time, not init)
 * - Missing KnowledgeService is handled gracefully
 * - Debounce: rapid changes to same file only trigger one index
 * - unsubscribe() stops receiving events
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mockIndexArtifact = vi.fn()
const mockRemoveDocument = vi.fn()
const mockSubscribe = vi.fn()
let capturedListener: ((event: unknown) => void) | null = null

// Must mock before any imports from the module under test
vi.mock('../../../../src/main/platform/memory', () => ({
  getKnowledgeService: vi.fn(() => ({
    indexArtifact: mockIndexArtifact,
    removeDocument: mockRemoveDocument,
  })),
}))

vi.mock('../../../../src/main/services/artifact.service', () => ({
  subscribeToArtifactChanges: vi.fn((listener: (event: unknown) => void) => {
    capturedListener = listener
    return () => {
      capturedListener = null
    }
  }),
}))

// Import AFTER mocks are set up
import { startKnowledgeArtifactBridge } from '../../../../src/main/services/knowledge-artifact-bridge'
import { getKnowledgeService } from '../../../../src/main/platform/memory'

const mockGetKnowledgeService = vi.mocked(getKnowledgeService)

describe('KnowledgeArtifactBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockIndexArtifact.mockReset()
    mockIndexArtifact.mockResolvedValue(undefined)
    mockRemoveDocument.mockReset()
    mockRemoveDocument.mockResolvedValue(undefined)
    mockSubscribe.mockReset()
    capturedListener = null
    // Restore getKnowledgeService to default mock (returns valid service)
    mockGetKnowledgeService.mockImplementation(() => ({
      indexArtifact: mockIndexArtifact,
      removeDocument: mockRemoveDocument,
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function fireEvent(event: Record<string, unknown>): void {
    if (capturedListener) {
      capturedListener(event)
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────

  it('should subscribe to artifact change events on start', () => {
    startKnowledgeArtifactBridge()
    expect(capturedListener).toBeInstanceOf(Function)
  })

  it('should return an unsubscribe function', () => {
    const stop = startKnowledgeArtifactBridge()
    expect(stop).toBeInstanceOf(Function)
    stop()
  })

  it('should not call getKnowledgeService on init (lazy eval)', () => {
    startKnowledgeArtifactBridge()
    expect(getKnowledgeService).not.toHaveBeenCalled()
  })

  // ── Supported files ───────────────────────────────────────────────────

  it('should call indexArtifact for .txt add event after debounce', async () => {
    startKnowledgeArtifactBridge()
    fireEvent({ type: 'add', path: '/workspace/doc.txt', relativePath: 'doc.txt', spaceId: 'space-1' })

    expect(mockIndexArtifact).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    await Promise.resolve()
    expect(mockIndexArtifact).toHaveBeenCalledWith('space-1', '/workspace/doc.txt')
  })

  it('should call indexArtifact for .md change event', async () => {
    startKnowledgeArtifactBridge()
    fireEvent({ type: 'change', path: '/workspace/notes.md', relativePath: 'notes.md', spaceId: 'space-1' })
    vi.advanceTimersByTime(500)
    await Promise.resolve()
    expect(mockIndexArtifact).toHaveBeenCalledWith('space-1', '/workspace/notes.md')
  })

  it('should support all valid file extensions', async () => {
    startKnowledgeArtifactBridge()
    const files = [
      { path: '/a.txt', ext: '.txt' },
      { path: '/b.md', ext: '.md' },
      { path: '/c.json', ext: '.json' },
      { path: '/d.csv', ext: '.csv' },
      { path: '/e.pdf', ext: '.pdf' },
    ]
    for (const f of files) {
      fireEvent({ type: 'add', path: f.path, relativePath: f.path.slice(1), spaceId: 's1' })
    }
    vi.advanceTimersByTime(500)
    await Promise.resolve()
    expect(mockIndexArtifact).toHaveBeenCalledTimes(5)
  })

  // ── Unsupported ───────────────────────────────────────────────────────

  it('should ignore unsupported file extensions', async () => {
    startKnowledgeArtifactBridge()
    fireEvent({ type: 'add', path: '/workspace/image.png', relativePath: 'image.png', spaceId: 's1' })
    fireEvent({ type: 'add', path: '/workspace/program.exe', relativePath: 'program.exe', spaceId: 's1' })
    fireEvent({ type: 'add', path: '/workspace/archive.zip', relativePath: 'archive.zip', spaceId: 's1' })
    vi.advanceTimersByTime(500)
    expect(mockIndexArtifact).not.toHaveBeenCalled()
  })

  // ── Event types ───────────────────────────────────────────────────────

  it('should call removeDocument for unlink (delete) events immediately', async () => {
    startKnowledgeArtifactBridge()
    fireEvent({ type: 'unlink', path: '/workspace/doc.txt', relativePath: 'doc.txt', spaceId: 's1' })
    // unlink is not debounced — removeDocument is called synchronously
    await Promise.resolve()
    expect(mockRemoveDocument).toHaveBeenCalledWith('s1', '/workspace/doc.txt')
    expect(mockIndexArtifact).not.toHaveBeenCalled()
  })

  it('should cancel pending index when unlink arrives for same path', async () => {
    startKnowledgeArtifactBridge()
    fireEvent({ type: 'add', path: '/workspace/doc.txt', relativePath: 'doc.txt', spaceId: 's1' })
    // Before debounce fires, file is deleted
    fireEvent({ type: 'unlink', path: '/workspace/doc.txt', relativePath: 'doc.txt', spaceId: 's1' })
    vi.advanceTimersByTime(500)
    await Promise.resolve()
    // removeDocument should be called, indexArtifact should not
    expect(mockRemoveDocument).toHaveBeenCalledWith('s1', '/workspace/doc.txt')
    expect(mockIndexArtifact).not.toHaveBeenCalled()
  })

  it('should ignore addDir and unlinkDir events', async () => {
    startKnowledgeArtifactBridge()
    fireEvent({ type: 'addDir', path: '/workspace/folder', relativePath: 'folder', spaceId: 's1' })
    fireEvent({ type: 'unlinkDir', path: '/workspace/folder', relativePath: 'folder', spaceId: 's1' })
    vi.advanceTimersByTime(500)
    expect(mockIndexArtifact).not.toHaveBeenCalled()
    expect(mockRemoveDocument).not.toHaveBeenCalled()
  })

  // ── Debounce ──────────────────────────────────────────────────────────

  it('should debounce rapid changes to the same file', async () => {
    startKnowledgeArtifactBridge()
    fireEvent({ type: 'add', path: '/workspace/doc.txt', relativePath: 'doc.txt', spaceId: 's1' })
    fireEvent({ type: 'change', path: '/workspace/doc.txt', relativePath: 'doc.txt', spaceId: 's1' })
    fireEvent({ type: 'change', path: '/workspace/doc.txt', relativePath: 'doc.txt', spaceId: 's1' })
    vi.advanceTimersByTime(200) // partial advance — still within debounce window

    fireEvent({ type: 'change', path: '/workspace/doc.txt', relativePath: 'doc.txt', spaceId: 's1' })
    vi.advanceTimersByTime(500)
    await Promise.resolve()
    expect(mockIndexArtifact).toHaveBeenCalledTimes(1)
    expect(mockIndexArtifact).toHaveBeenCalledWith('s1', '/workspace/doc.txt')
  })

  // ── Edge cases ────────────────────────────────────────────────────────

  it('should handle missing KnowledgeService gracefully', async () => {
    mockGetKnowledgeService.mockReturnValue(null as never)

    startKnowledgeArtifactBridge()
    fireEvent({ type: 'add', path: '/workspace/doc.txt', relativePath: 'doc.txt', spaceId: 's1' })
    vi.advanceTimersByTime(500)

    expect(capturedListener).toBeTruthy()
  })

  it('should handle indexArtifact errors gracefully', async () => {
    mockIndexArtifact.mockRejectedValue(new Error('disk full'))
    startKnowledgeArtifactBridge()
    fireEvent({ type: 'add', path: '/workspace/doc.txt', relativePath: 'doc.txt', spaceId: 's1' })
    vi.advanceTimersByTime(500)
    await Promise.resolve()
    expect(mockIndexArtifact).toHaveBeenCalled()
  })

  it('should not fire events after unsubscribe', async () => {
    const stop = startKnowledgeArtifactBridge()
    stop()

    fireEvent({ type: 'add', path: '/workspace/doc.txt', relativePath: 'doc.txt', spaceId: 's1' })
    vi.advanceTimersByTime(500)
    expect(mockIndexArtifact).not.toHaveBeenCalled()
  })

  it('should cancel pending timers on unsubscribe', async () => {
    const stop = startKnowledgeArtifactBridge()

    fireEvent({ type: 'add', path: '/workspace/doc.txt', relativePath: 'doc.txt', spaceId: 's1' })
    stop()
    vi.advanceTimersByTime(500)
    expect(mockIndexArtifact).not.toHaveBeenCalled()
  })

  it('should handle files with no extension', async () => {
    startKnowledgeArtifactBridge()
    fireEvent({ type: 'add', path: '/workspace/README', relativePath: 'README', spaceId: 's1' })
    vi.advanceTimersByTime(500)
    expect(mockIndexArtifact).not.toHaveBeenCalled()
  })
})
