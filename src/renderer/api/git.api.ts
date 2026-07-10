/**
 * gitApi — git status slice of the unified api object.
 * Desktop-only; remote mode returns an empty result.
 */
import { isElectron } from './_shared'
import type { GitStatusResult, GitDiffResult } from '../../shared/rpc/contracts/git.contract'

export const gitApi = {
  gitStatus: async (spaceId: string): Promise<{ success: boolean; data?: GitStatusResult; error?: string }> => {
    if (!isElectron()) {
      return { success: true, data: { branch: null, files: [] } }
    }
    return window.halo.gitStatus(spaceId)
  },
  gitDiff: async (spaceId: string, filePath: string, staged?: boolean): Promise<{ success: boolean; data?: GitDiffResult; error?: string }> => {
    if (!isElectron()) {
      return { success: true, data: { diff: '', filePath } }
    }
    return window.halo.gitDiff(spaceId, filePath, staged)
  },
  gitCheckAvailability: async (): Promise<{ success: boolean; data?: boolean; error?: string }> => {
    if (!isElectron()) {
      return { success: true, data: false }
    }
    return window.halo.gitCheckAvailability()
  },
}
