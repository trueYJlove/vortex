import { rpcMethod } from '../define'

export interface GitFileStatus {
  path: string
  relativePath: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  insertions?: number
  deletions?: number
}

export interface GitStatusResult {
  branch: string | null
  files: GitFileStatus[]
}

export interface GitDiffResult {
  diff: string
  filePath: string
}

export const gitRpc = {
  gitStatus: rpcMethod<[spaceId: string], GitStatusResult>('git:status'),
  gitDiff: rpcMethod<[spaceId: string, filePath: string, staged?: boolean], GitDiffResult>('git:diff'),
  gitCheckAvailability: rpcMethod<[], boolean>('git:check-availability'),
}
