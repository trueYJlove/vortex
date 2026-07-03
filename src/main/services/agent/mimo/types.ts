import type { EngineCapabilities } from '../capabilities'

export interface MimoSdkModule {
  tool: (...args: any[]) => any
  createSdkMcpServer: (options: any) => any
  createSession: (options: Record<string, any>) => Promise<any>
  query: (params: any) => AsyncIterable<any>
  capabilities: EngineCapabilities
}
