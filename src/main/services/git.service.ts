import { exec } from 'child_process'
import { promisify } from 'util'
import { join, isAbsolute, normalize } from 'path'
import type { GitFileStatus, GitStatusResult, GitDiffResult } from '../../shared/rpc/contracts/git.contract'

const execAsync = promisify(exec)

/**
 * Check if git is available on the system.
 * Cached after first check to avoid repeated subprocess calls.
 */
let gitAvailable: boolean | null = null
export async function isGitAvailable(): Promise<boolean> {
  if (gitAvailable !== null) return gitAvailable
  try {
    await execAsync('git --version', { timeout: 5000, windowsHide: true })
    gitAvailable = true
  } catch {
    gitAvailable = false
  }
  return gitAvailable
}

/**
 * Parse `git diff --numstat` output into a map of file path to insertions/deletions.
 * Format per line: "insertions\tdeletions\tfile"
 * Binary files show "-" for both counts.
 * Exported for unit testing.
 */
export function parseNumstat(output: string): Map<string, { insertions: number; deletions: number }> {
  const map = new Map<string, { insertions: number; deletions: number }>()
  const lines = output.split('\n').filter(line => line.length > 0)

  for (const line of lines) {
    const parts = line.split('\t')
    if (parts.length < 3) continue

    const [insertionsStr, deletionsStr, ...fileParts] = parts
    const filePath = fileParts.join('\t') // Handle files with tabs in name (rare)

    // Binary files show "-" for both counts
    const insertions = insertionsStr === '-' ? 0 : parseInt(insertionsStr, 10)
    const deletions = deletionsStr === '-' ? 0 : parseInt(deletionsStr, 10)

    if (!isNaN(insertions) && !isNaN(deletions)) {
      map.set(filePath, { insertions, deletions })
    }
  }

  return map
}

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
    // Get file statuses
    const { stdout: statusOutput } = await execAsync('git status --porcelain -b', {
      cwd: spacePath,
      timeout: 10000,
      windowsHide: true,
    })
    const result = parseGitStatusPorcelain(statusOutput)

    // Get line counts for unstaged changes
    let unstagedNumstat = new Map<string, { insertions: number; deletions: number }>()
    try {
      const { stdout: numstatOutput } = await execAsync('git diff --numstat', {
        cwd: spacePath,
        timeout: 10000,
        windowsHide: true,
      })
      unstagedNumstat = parseNumstat(numstatOutput)
    } catch {
      // Ignore errors for numstat (e.g., binary files)
    }

    // Get line counts for staged changes
    let stagedNumstat = new Map<string, { insertions: number; deletions: number }>()
    try {
      const { stdout: cachedNumstatOutput } = await execAsync('git diff --cached --numstat', {
        cwd: spacePath,
        timeout: 10000,
        windowsHide: true,
      })
      stagedNumstat = parseNumstat(cachedNumstatOutput)
    } catch {
      // Ignore errors for cached numstat
    }

    // Merge line counts into files
    for (const file of result.files) {
      // Try staged first (for newly added files), then unstaged
      const stagedStats = stagedNumstat.get(file.path)
      const unstagedStats = unstagedNumstat.get(file.path)

      if (stagedStats) {
        file.insertions = stagedStats.insertions
        file.deletions = stagedStats.deletions
      } else if (unstagedStats) {
        file.insertions = unstagedStats.insertions
        file.deletions = unstagedStats.deletions
      }
    }

    // Resolve `path` to absolute so consumers (e.g. shell.showItemInFolder) can locate the file.
    // `parseGitStatusPorcelain` emits repo-relative paths; `relativePath` stays as-is for display.
    for (const file of result.files) {
      file.path = isAbsolute(file.path) ? normalize(file.path) : normalize(join(spacePath, file.path))
    }

    return result
  } catch {
    // Not a git repo, git not installed, or other error
    return { branch: null, files: [] }
  }
}

/**
 * Get git diff for a specific file.
 * @param spacePath - The git repository path
 * @param filePath - The file path relative to the repository root
 * @param staged - If true, show staged changes; otherwise show unstaged changes
 * @returns The diff output as a string
 */
export async function getGitDiff(spacePath: string, filePath: string, staged: boolean = false): Promise<GitDiffResult> {
  try {
    const diffFlag = staged ? '--cached' : ''
    const { stdout } = await execAsync(`git diff ${diffFlag} -- "${filePath}"`, {
      cwd: spacePath,
      timeout: 10000,
      windowsHide: true,
    })
    return { diff: stdout, filePath }
  } catch {
    // For new files (untracked), show the file content as added
    try {
      const { stdout } = await execAsync(`cat "${filePath}"`, {
        cwd: spacePath,
        timeout: 10000,
        windowsHide: true,
      })
      // Format as all additions
      const lines = stdout.split('\n')
      const diff = lines.map((line, index) => `+${line}`).join('\n')
      return { diff, filePath }
    } catch {
      return { diff: '', filePath }
    }
  }
}
