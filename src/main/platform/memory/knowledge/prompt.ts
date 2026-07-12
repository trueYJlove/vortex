/**
 * knowledge -- Knowledge Summary Builder
 *
 * Builds a markdown summary of the knowledge base for injection into
 * AI agent initial messages. The summary tells the agent what documents
 * are available and how to search them.
 */

import type { KnowledgeDocument } from './types'

export function buildKnowledgeSummary(documents: KnowledgeDocument[]): string {
  if (documents.length === 0) return ''
  const lines = documents.map(d =>
    `- ${d.fileName} (${d.fileType}, ${d.chunkCount} chunks)`
  )
  return `## Knowledge Base\n\nThis space has a knowledge base with ${documents.length} documents:\n${lines.join('\n')}\n\nUse the \`knowledge_search\` tool to retrieve relevant content when you need to reference these documents.`
}
