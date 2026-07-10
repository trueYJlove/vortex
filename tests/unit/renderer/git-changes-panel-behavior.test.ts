import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../../..')
const readSource = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf-8')

describe('git changes panel behavior', () => {
  it('uses theme tokens and accessible controls for the diff modal', () => {
    const source = readSource('src/renderer/components/artifact/GitChangesPanel.tsx')

    expect(source).not.toContain('bg-black/50')
    expect(source).toContain('bg-background/80')
    expect(source).toContain("aria-label={t('Close diff')}")
  })

  it('cancels the pending click action before opening diff on double click', () => {
    const source = readSource('src/renderer/components/artifact/GitChangesPanel.tsx')

    expect(source).toContain('clickTimerRef')
    expect(source).toContain('clearTimeout(clickTimerRef.current)')
    expect(source).toContain('setTimeout')
  })

  it('clears stale git status when fetching fails', () => {
    const source = readSource('src/renderer/hooks/useGitStatus.ts')
    const catchIndex = source.indexOf('catch (err)')

    expect(catchIndex).toBeGreaterThan(-1)
    expect(source.indexOf('setFiles([])', catchIndex)).toBeGreaterThan(catchIndex)
    expect(source.indexOf('setBranch(null)', catchIndex)).toBeGreaterThan(catchIndex)
  })
})
