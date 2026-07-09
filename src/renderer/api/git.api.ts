/**
 * gitApi — git status slice of the unified api object.
 * Desktop-only; remote mode returns an empty result.
 */
import { isElectron } from './_shared'

export interface GitFileStatus {
  path: string
  relativePath: string
  status: string
}

export interface GitStatusResult {
  branch: string | null
  files: GitFileStatus[]
}

export interface GitStatusResponse {
  success: boolean
  data?: GitStatusResult
  error?: string
}

export const gitApi = {
  gitStatus: async (spaceId: string): Promise<GitStatusResponse> => {
    if (!isElectron()) {
      return { success: true, data: { branch: null, files: [] } }
    }
    return window.halo.gitStatus(spaceId)
  },
}
