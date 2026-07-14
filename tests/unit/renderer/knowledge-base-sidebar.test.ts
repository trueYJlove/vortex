import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../../..')
const readSource = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf-8')

describe('knowledge-base sidebar height fix', () => {
  it('ContentType includes knowledge-base type', () => {
    const source = readSource('src/renderer/services/canvas-lifecycle.ts')
    expect(source).toContain("'knowledge-base'")
  })

  it('canvasLifecycle has openKnowledgeBase method with dedup logic', () => {
    const source = readSource('src/renderer/services/canvas-lifecycle.ts')
    expect(source).toContain('openKnowledgeBase(')
    // Dedup: check for existing knowledge-base tab before creating new one
    expect(source).toMatch(/openKnowledgeBase[\s\S]*?type === 'knowledge-base'[\s\S]*?switchTab/)
  })

  it('canvas store interface declares openKnowledgeBase', () => {
    const source = readSource('src/renderer/stores/canvas.store.ts')
    expect(source).toContain('openKnowledgeBase: () => Promise<void>')
  })

  it('canvas store implementation delegates openKnowledgeBase to canvasLifecycle', () => {
    const source = readSource('src/renderer/stores/canvas.store.ts')
    expect(source).toContain('openKnowledgeBase: async () => {')
    expect(source).toContain('await canvasLifecycle.openKnowledgeBase()')
  })

  it('useCanvasLifecycle hook exposes openKnowledgeBase', () => {
    const source = readSource('src/renderer/hooks/useCanvasLifecycle.ts')
    expect(source).toContain('const openKnowledgeBase = useCallback(')
    expect(source).toContain('canvasLifecycle.openKnowledgeBase()')
  })

  it('KnowledgeBaseViewer component file exists and exports component', () => {
    const source = readSource('src/renderer/components/canvas/viewers/KnowledgeBaseViewer.tsx')
    expect(source).toContain('export function KnowledgeBaseViewer')
    expect(source).toContain('useKnowledgeStore')
    expect(source).toContain('useTranslation')
  })

  it('KnowledgeBaseViewer renders full document list without slice limit', () => {
    const source = readSource('src/renderer/components/canvas/viewers/KnowledgeBaseViewer.tsx')
    // Full list - should NOT contain slice(0, 3)
    expect(source).not.toContain('slice(0, 3)')
    // Should render all documents
    expect(source).toMatch(/documents\.map/)
  })

  it('KnowledgeBaseViewer supports upload and delete actions', () => {
    const source = readSource('src/renderer/components/canvas/viewers/KnowledgeBaseViewer.tsx')
    expect(source).toContain('handleUpload')
    expect(source).toContain('handleDelete')
  })

  it('ContentCanvas imports KnowledgeBaseViewer', () => {
    const source = readSource('src/renderer/components/canvas/ContentCanvas.tsx')
    expect(source).toContain("import { KnowledgeBaseViewer } from './viewers/KnowledgeBaseViewer'")
  })

  it('ContentCanvas switch routes knowledge-base to KnowledgeBaseViewer', () => {
    const source = readSource('src/renderer/components/canvas/ContentCanvas.tsx')
    expect(source).toMatch(/case 'knowledge-base':[\s\S]*?<KnowledgeBaseViewer tab={tab} \/>/)
  })

  it('KnowledgeBasePanel slices documents to max 3', () => {
    const source = readSource('src/renderer/components/knowledge/KnowledgeBasePanel.tsx')
    expect(source).toContain('slice(0, 3)')
  })

  it('KnowledgeBasePanel shows View all button when docs exceed 3', () => {
    const source = readSource('src/renderer/components/knowledge/KnowledgeBasePanel.tsx')
    expect(source).toContain("t('View all ({{count}})'")
    expect(source).toContain('documents.length > 3')
  })

  it('KnowledgeBasePanel View all button calls openKnowledgeBase', () => {
    const source = readSource('src/renderer/components/knowledge/KnowledgeBasePanel.tsx')
    expect(source).toContain('openKnowledgeBase')
    expect(source).toContain('useCanvasStore')
  })
})