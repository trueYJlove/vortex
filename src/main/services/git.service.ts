import { exec } from 'child_process'
import { promisify } from 'util'
import type { GitFileStatus, GitStatusResult } from '../../shared/rpc/contracts/git.contract'

const execAsync = promisify(exec)

/**
 * Parse `git status --porcelain -b` output into structured data.
 * Exported for unit testing.
 */
export function parseGitStatusPorcelain(output: string): GitStatusResult {
  const lines = output.split('\n').filter(line => line.length > 0)
  if (lines.length === 0) return { branch: null, files: [] }

  // First line: branch info (## main...origin/main [ahead 1])
  const branchLine = lines[0]
  const branchMatch = branchLine.match(/^## (.+?)(?:\.\.\.|$)/)
  const branch = branchMatch ? branchMatch[1] : null

  const files: GitFileStatus[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.length < 4) continue

    const indexStatus = line[0]
    const workTreeStatus = line[1]
    const filePath = line.substring(3)

    // Renamed: "R  old.ts -> new.ts"
    if (indexStatus === 'R' || indexStatus === 'C') {
      const arrowIndex = filePath.indexOf(' -> ')
      if (arrowIndex !== -1) {
        const newPath = filePath.substring(arrowIndex + 4)
        files.push({
          path: newPath,
          relativePath: newPath,
          status: indexStatus === 'R' ? 'renamed' : 'added',
        })
        continue
      }
    }

    // Untracked: "?? file"
    if (indexStatus === '?' && workTreeStatus === '?') {
      files.push({ path: filePath, relativePath: filePath, status: 'untracked' })
      continue
    }

    // Deleted: " D file" or "D  file"
    if (indexStatus === 'D' || workTreeStatus === 'D') {
      files.push({ path: filePath, relativePath: filePath, status: 'deleted' })
      continue
    }

    // Added: "A  file"
    if (indexStatus === 'A') {
      files.push({ path: filePath, relativePath: filePath, status: 'added' })
      continue
    }

    // Modified: " M file" or "M  file" or "MM file"
    if (indexStatus === 'M' || workTreeStatus === 'M') {
      files.push({ path: filePath, relativePath: filePath, status: 'modified' })
      continue
    }
  }

  return { branch, files }
}

/**
 * Get git status for a space directory.
 * Returns empty result for non-git directories (no error thrown).
 */
export async function getGitStatus(spacePath: string): Promise<GitStatusResult> {
  try {
    const { stdout } = await execAsync('git status --porcelain -b', {
      cwd: spacePath,
      timeout: 10000,
      windowsHide: true,
    })
    return parseGitStatusPorcelain(stdout)
  } catch {
    // Not a git repo, git not installed, or other error
    return { branch: null, files: [] }
  }
}
