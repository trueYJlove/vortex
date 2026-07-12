/**
 * knowledge -- Knowledge Search MCP Tool
 *
 * Creates an SDK MCP server that provides the `knowledge_search` tool.
 * This tool allows AI agents to search the space knowledge base for
 * relevant document fragments matching their query.
 *
 * Uses the same tool() + createSdkMcpServer() pattern as platform/memory/tools.ts.
 */

import { tool, createSdkMcpServer } from '../../../services/agent/resolved-sdk'
import type { KnowledgeService } from './types'

export function createKnowledgeSearchMcpServer(params: {
  spaceId: string
  knowledgeService: KnowledgeService
}) {
  return createSdkMcpServer({
    name: 'knowledge-search',
    version: '1.0.0',
    tools: [
      tool(
        'knowledge_search',
        'Search the space knowledge base for relevant document fragments matching your query.',
        {
          query: { type: 'string', description: 'Search query — keywords or phrases' },
          topK: { type: 'number', description: 'Max results (default 5). Optional.', optional: true },
        },
        async ({ query, topK }) => {
          const results = await params.knowledgeService.search({
            scope: 'space',
            spaceId: params.spaceId,
            query,
            topK: topK ?? 5,
          })
          if (results.length === 0) {
            return { content: [{ type: 'text', text: 'No results found.' }] }
          }
          const text = results.map((r, i) =>
            `[${i + 1}] ${r.documentName} (chunk ${r.chunkIndex}, score ${r.score.toFixed(2)})\n${r.content}\n`
          ).join('\n')
          return { content: [{ type: 'text', text }] }
        }
      ),
    ],
  })
}
