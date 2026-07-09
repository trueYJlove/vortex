import { registerRpcHandlers } from './rpc'
import { gitRpc } from '../../shared/rpc/contracts/git.contract'
import { getGitStatus } from '../services/git.service'
import { getSpace } from '../services/space.service'

export function registerGitHandlers(): void {
  registerRpcHandlers(gitRpc, {
    gitStatus: async (spaceId: string) => {
      const space = getSpace(spaceId)
      if (!space) return { branch: null, files: [] }
      const spacePath = space.workingDir || space.path
      return getGitStatus(spacePath)
    },
  }, 'Git')
}
