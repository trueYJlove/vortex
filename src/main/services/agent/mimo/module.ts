import { MimoSession } from './session-adapter'
import { MIMO_CAPABILITIES } from './capabilities'
import type { MimoSdkModule } from './types'

export function createMimoSdkModule(): MimoSdkModule {
  return {
    tool,
    createSdkMcpServer,
    capabilities: MIMO_CAPABILITIES,
    async createSession(options: Record<string, any>) {
      return MimoSession.create(options)
    },
    query(params: any) {
      return queryMimo(params)
    },
  }
}

function tool(..._args: any[]): any {
  return undefined
}

function createSdkMcpServer(_options: any): any {
  return undefined
}

async function* queryMimo(params: any): AsyncGenerator<any> {
  const session = await MimoSession.create({
    ...(params?.options || {}),
    resume: params?.options?.resume,
  })
  try {
    session.send(params?.prompt || 'hi')
    yield* session.stream()
  } finally {
    await session.close()
  }
}
