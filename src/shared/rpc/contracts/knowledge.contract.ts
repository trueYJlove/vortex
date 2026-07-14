/**
 * Knowledge RPC contract (passthrough). Exposes knowledge base operations
 * (list, search, delete, upload, reindex) to the renderer. Handler bodies
 * and return shapes are preserved verbatim by the IPC layer.
 */
import { rawRpcMethod } from '../define'

export const knowledgeRpc = {
  knowledgeList: rawRpcMethod('knowledge:list'),
  knowledgeSearch: rawRpcMethod('knowledge:search'),
  knowledgeDelete: rawRpcMethod('knowledge:delete'),
  knowledgeUpload: rawRpcMethod('knowledge:upload'),
  knowledgeReindex: rawRpcMethod('knowledge:reindex'),
}