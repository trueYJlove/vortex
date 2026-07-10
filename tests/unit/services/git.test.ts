import { describe, it, expect } from 'vitest'
import { parseGitStatusPorcelain, parseNumstat } from '../../../src/main/services/git.service'

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

  describe('parseNumstat', () => {
    it('parses normal numstat output', () => {
      const output = '10\t5\tsrc/foo.ts\n20\t10\tsrc/bar.ts\n'
      const result = parseNumstat(output)
      expect(result.size).toBe(2)
      expect(result.get('src/foo.ts')).toEqual({ insertions: 10, deletions: 5 })
      expect(result.get('src/bar.ts')).toEqual({ insertions: 20, deletions: 10 })
    })

    it('handles binary files', () => {
      const output = '-\t-\timage.png\n'
      const result = parseNumstat(output)
      expect(result.get('image.png')).toEqual({ insertions: 0, deletions: 0 })
    })

    it('handles files with tabs in name', () => {
      const output = '5\t3\tfile\twith\ttabs.ts\n'
      const result = parseNumstat(output)
      expect(result.get('file\twith\ttabs.ts')).toEqual({ insertions: 5, deletions: 3 })
    })

    it('returns empty map for empty input', () => {
      const result = parseNumstat('')
      expect(result.size).toBe(0)
    })

    it('handles mixed binary and text files', () => {
      const output = '10\t5\tsrc/foo.ts\n-\t-\timage.png\n20\t10\tsrc/bar.ts\n'
      const result = parseNumstat(output)
      expect(result.size).toBe(3)
      expect(result.get('src/foo.ts')).toEqual({ insertions: 10, deletions: 5 })
      expect(result.get('image.png')).toEqual({ insertions: 0, deletions: 0 })
      expect(result.get('src/bar.ts')).toEqual({ insertions: 20, deletions: 10 })
    })
  })
})
