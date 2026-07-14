/**
 * workflow-utils - converters between WorkflowStep[] and React Flow nodes/edges.
 *
 * stepsToReactFlow arranges nodes vertically with even spacing and generates
 * sequential edges plus condition branch edges.
 *
 * reactFlowToSteps sorts by Y position so the canvas drag-reorder maps
 * directly to execution order. Dangling goto/default references (targeting
 * deleted nodes) are automatically cleaned up.
 */
import type { Node, Edge } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { WorkflowStep } from '../../../shared/apps/spec-types'

/** Custom node type identifiers for React Flow - mirrors WorkflowStepType */
export type WorkflowNodeType = 'llm_call' | 'tool_call' | 'condition'

/** Data payload carried by every workflow React Flow node */
export interface WorkflowNodeData {
  step: WorkflowStep
  label: string
  /** Optional callbacks injected by WorkflowEditor */
  onUpdate?: (data: Partial<WorkflowNodeData>) => void
  onDelete?: () => void
}

const VERTICAL_GAP = 140

/** Map WorkflowStep[] to React Flow nodes with simple vertical positioning */
export function stepsToReactFlow(steps: WorkflowStep[]): {
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]
} {
  const nodes: Node<WorkflowNodeData>[] = steps.map((step, i) => ({
    id: step.id,
    type: step.type,
    position: { x: 0, y: i * VERTICAL_GAP },
    data: { step, label: step.id },
  }))

  const edges: Edge[] = buildEdges(steps)

  return { nodes, edges }
}

const DEFAULT_EDGE_STYLE = { stroke: 'hsl(var(--primary))', strokeWidth: 2 }
const DEFAULT_EDGE_MARKER = { type: MarkerType.ArrowClosed as const, color: 'hsl(var(--primary))' }

/** Build edges from steps - sequential, condition branches, default fallback */
function buildEdges(steps: WorkflowStep[]): Edge[] {
  const edges: Edge[] = []

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]

    // Sequential edge to next step (not for condition - condition uses goto edges)
    if (step.type !== 'condition' && i < steps.length - 1) {
      edges.push({
        id: `e:${step.id}->${steps[i + 1].id}`,
        source: step.id,
        target: steps[i + 1].id,
        type: 'smoothstep',
        animated: true,
        markerEnd: DEFAULT_EDGE_MARKER,
        style: DEFAULT_EDGE_STYLE,
      })
    }

    // Condition branch edges
    if (step.type === 'condition') {
      for (const c of step.cases) {
        const operator = Object.keys(c.when)[0]
        const value = c.when[operator as keyof typeof c.when]
        edges.push({
          id: `e:${step.id}->${c.goto}:case`,
          source: step.id,
          target: c.goto,
          type: 'smoothstep',
          label: `${operator}: ${String(value ?? '')}`,
          markerEnd: DEFAULT_EDGE_MARKER,
          style: DEFAULT_EDGE_STYLE,
        })
      }
      if (step.default) {
        edges.push({
          id: `e:${step.id}->${step.default}:default`,
          source: step.id,
          target: step.default,
          type: 'smoothstep',
          label: 'default',
          markerEnd: { type: MarkerType.ArrowClosed as const, color: 'hsl(var(--muted-foreground))' },
          style: {
            stroke: 'hsl(var(--muted-foreground))',
            strokeDasharray: '4',
            strokeWidth: 2,
          },
        })
      }
      // Fallback: connect condition sequentially when it has no branches
      if (step.cases.length === 0 && !step.default && i < steps.length - 1) {
        edges.push({
          id: `e:${step.id}->${steps[i + 1].id}`,
          source: step.id,
          target: steps[i + 1].id,
          type: 'smoothstep',
          animated: true,
          markerEnd: DEFAULT_EDGE_MARKER,
          style: DEFAULT_EDGE_STYLE,
        })
      }
    }
  }

  return edges
}

/** Convert React Flow nodes/edges back to WorkflowStep[], sorted by Y position */
export function reactFlowToSteps(
  nodes: Node<WorkflowNodeData>[],
  _edges: Edge[],
): WorkflowStep[] {
  const existingIds = new Set(nodes.map((n) => n.id))

  return [...nodes]
    .sort((a, b) => a.position.y - b.position.y)
    .map((node) => {
      const step = { ...node.data.step }

      // Clean up dangling goto/default references
      if (step.type === 'condition') {
        step.cases = step.cases.filter((c) => existingIds.has(c.goto))
        if (step.default && !existingIds.has(step.default)) {
          delete step.default
        }
      }

      return step
    })
}

/** Generate a unique step id by incrementing the highest step_N number found */
export function generateStepId(
  existingIds: Set<string>,
  prefix = 'step',
): string {
  let i = 1
  while (existingIds.has(`${prefix}_${i}`)) i++
  return `${prefix}_${i}`
}