/**
 * gitApi — git status slice of the unified api object.
 * Desktop-only; remote mode returns an empty result.
 */
import { isElectron } from './_shared'
import type { GitStatusResult } from '../../shared/rpc/contracts/git.contract'

export const gitApi = {
  gitStatus: async (spaceId: string): Promise<{ success: boolean; data?: GitStatusResult; error?: string }> => {
    if (!isElectron()) {
      return { success: true, data: { branch: null, files: [] } }
    }
    return window.halo.gitStatus(spaceId)
  },
}
