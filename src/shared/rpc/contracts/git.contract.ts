import { rpcMethod } from '../define'

export interface GitFileStatus {
  path: string
  relativePath: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
}

export interface GitStatusResult {
  branch: string | null
  files: GitFileStatus[]
}

export const gitRpc = {
  gitStatus: rpcMethod<[spaceId: string], GitStatusResult>('git:status'),
}
