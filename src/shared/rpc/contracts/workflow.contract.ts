/**
 * Workflow RPC contract (passthrough). Exposes workflow execution history
 * (runs + node details) for the Execution Replay UI.
 */
import { rawRpcMethod } from '../define'

export const workflowRpc = {
  workflowListRuns: rawRpcMethod('workflow:list-runs'),
  workflowGetRun: rawRpcMethod('workflow:get-run'),
  workflowGetNodeRuns: rawRpcMethod('workflow:get-node-runs'),
}