import { createOpencodeClient, createOpencodeServer, type OpencodeClient } from '@mimo-ai/sdk/v2'

export interface MimoServerHandle {
  url: string
  client: OpencodeClient
  close: () => void
}

export async function startMimoServer(options?: {
  hostname?: string
  port?: number
  timeout?: number
  signal?: AbortSignal
  config?: Record<string, any>
}): Promise<MimoServerHandle> {
  const server = await createOpencodeServer({
    hostname: options?.hostname ?? '127.0.0.1',
    port: options?.port ?? 0,
    timeout: options?.timeout ?? 10000,
    signal: options?.signal,
    config: options?.config,
  })

  const client = createOpencodeClient({
    baseUrl: server.url,
  })

  return {
    url: server.url,
    client,
    close: () => server.close(),
  }
}
