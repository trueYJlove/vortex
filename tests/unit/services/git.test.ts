import { describe, it, expect } from 'vitest'
import { parseGitStatusPorcelain } from '../../../src/main/services/git.service'

describe('Git Service', () => {
  describe('parseGitStatusPorcelain', () => {
    it('parses modified files', () => {
      const output = '## main\n M src/foo.ts\n M src/bar.ts\n'
      const result = parseGitStatusPorcelain(output)
      expect(result.branch).toBe('main')
      expect(result.files).toHaveLength(2)
      expect(result.files[0]).toEqual({ path: 'src/foo.ts', relativePath: 'src/foo.ts', status: 'modified' })
      expect(result.files[1]).toEqual({ path: 'src/bar.ts', relativePath: 'src/bar.ts', status: 'modified' })
    })

    it('parses added files', () => {
      const output = '## main\nA  src/new.ts\n'
      const result = parseGitStatusPorcelain(output)
      expect(result.files[0].status).toBe('added')
    })

    it('parses deleted files', () => {
      const output = '## main\n D src/old.ts\n'
      const result = parseGitStatusPorcelain(output)
      expect(result.files[0].status).toBe('deleted')
    })

    it('parses untracked files', () => {
      const output = '## main\n?? src/untracked.ts\n'
      const result = parseGitStatusPorcelain(output)
      expect(result.files[0]).toEqual({ path: 'src/untracked.ts', relativePath: 'src/untracked.ts', status: 'untracked' })
    })

    it('parses renamed files', () => {
      const output = '## main\nR  src/old.ts -> src/new.ts\n'
      const result = parseGitStatusPorcelain(output)
      expect(result.files[0].status).toBe('renamed')
      expect(result.files[0].relativePath).toBe('src/new.ts')
    })

    it('returns empty for no changes', () => {
      const output = '## main\n'
      const result = parseGitStatusPorcelain(output)
      expect(result.branch).toBe('main')
      expect(result.files).toHaveLength(0)
    })

    it('handles branch with tracking info', () => {
      const output = '## main...origin/main\n M src/foo.ts\n'
      const result = parseGitStatusPorcelain(output)
      expect(result.branch).toBe('main')
    })

    it('handles empty input', () => {
      const result = parseGitStatusPorcelain('')
      expect(result.branch).toBeNull()
      expect(result.files).toHaveLength(0)
    })
  })
})
