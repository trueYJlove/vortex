/**
 * WorkflowEditor
 *
 * React Flow-based visual editor for automation app workflow DAGs.
 * Loads steps from app.spec.steps, renders them as a node graph,
 * and persists changes via appUpdateSpec.
 */
import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  SelectionMode,
  MarkerType,
  ConnectionLineType,
  type Connection,
  type Node,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Save, Loader2, AlertCircle, RotateCcw, Brain, Wrench, GitBranch } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useAppsStore } from '../../stores/apps.store'
import { stepsToReactFlow, reactFlowToSteps, generateStepId, type WorkflowNodeData } from './workflow-utils'
import { NodePropertyPanel } from './NodePropertyPanel'
import { LlmCallNode } from './nodes/LlmCallNode'
import { ToolCallNode } from './nodes/ToolCallNode'
import { ConditionNode } from './nodes/ConditionNode'
import type { WorkflowStep, LlmCallStep, ToolCallStep, ConditionStep } from '../../../shared/apps/spec-types'

// Register custom node types
const nodeTypes: NodeTypes = {
  llm_call: LlmCallNode,
  tool_call: ToolCallNode,
  condition: ConditionNode,
}

interface WorkflowEditorProps {
  appId: string
}

const DEFAULT_POSITION = { x: 0, y: 0 }

export function WorkflowEditor({ appId }: WorkflowEditorProps) {
  const { t } = useTranslation()
  const { apps, updateAppSpec } = useAppsStore()
  const app = apps.find(a => a.id === appId)
  const steps = useMemo(
    () => app?.spec.type === 'automation' ? (app.spec.steps ?? []) : [],
    [app],
  )

  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNode, setSelectedNode] = useState<Node<WorkflowNodeData> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track whether the user has modified the canvas since load/save.
  // Comparing the current canvas-derived steps against the last saved
  // steps catches all edits (node additions, property changes, reordering,
  // deletions) because reactFlowToSteps serializes the full canvas state.
  const originalStepsRef = useRef<string>(JSON.stringify(steps))
  const currentStepsJson = useMemo(
    () => JSON.stringify(reactFlowToSteps(nodes, edges)),
    [nodes, edges],
  )
  const hasChanges = currentStepsJson !== originalStepsRef.current

  // Initialize / re-initialize from spec steps
  useEffect(() => {
    const { nodes: n, edges: e } = stepsToReactFlow(steps)
    setNodes(n)
    setEdges(e)
    setSelectedNode(null)
    setSaveSuccess(false)
    setError(null)
    originalStepsRef.current = JSON.stringify(steps)
  }, [appId, setNodes, setEdges, steps])

  // ── Connection handling ──
  const onConnect = useCallback(
    (connection: Connection) => {
      console.log('[WorkflowEditor] onConnect called:', connection)
      if (!connection.source || !connection.target) {
        console.warn('[WorkflowEditor] invalid connection:', connection)
        return
      }
      setEdges(eds =>
        addEdge(
          {
            ...connection,
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' },
          },
          eds,
        ),
      )
    },
    [setEdges],
  )

  const onConnectStart = useCallback((_event: any, params: any) => {
    console.log('[WorkflowEditor] onConnectStart:', params)
  }, [])

  const onConnectEnd = useCallback((_event: any, connection: any) => {
    console.log('[WorkflowEditor] onConnectEnd:', connection)
  }, [])

  // ── Node selection ──
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<WorkflowNodeData>) => {
      setSelectedNode(node)
    },
    [],
  )

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node<WorkflowNodeData>[] }) => {
      if (selectedNodes.length === 1) {
        setSelectedNode(selectedNodes[0])
      } else if (selectedNodes.length !== 1) {
        setSelectedNode(null)
      }
    },
    [],
  )

  const handlePanelClose = useCallback(() => {
    setSelectedNode(null)
  }, [])

  // ── Add node at viewport center ──
  const handleAddNode = useCallback(
    (type: WorkflowStep['type'], dropPosition?: { x: number; y: number }) => {
      const id = generateStepId(new Set(nodes.map(n => n.id)))

      let position = DEFAULT_POSITION
      if (dropPosition) {
        position = reactFlowInstance
          ? reactFlowInstance.screenToFlowPosition(dropPosition)
          : DEFAULT_POSITION
      } else if (reactFlowInstance) {
        const wrapperEl = reactFlowWrapper.current
        if (wrapperEl) {
          const rect = wrapperEl.getBoundingClientRect()
          position = reactFlowInstance.screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          })
        }
      }

      const newNode: Node<WorkflowNodeData> = {
        id,
        type,
        position,
        data: {
          id,
          label: id,
          type,
        },
      }

      // Add step-specific default data
      if (type === 'llm_call') {
        newNode.data.step = { id, type: 'llm_call', prompt: '' } as LlmCallStep
      } else if (type === 'tool_call') {
        newNode.data.step = { id, type: 'tool_call', tool: '' } as ToolCallStep
      } else if (type === 'condition') {
        newNode.data.step = { id, type: 'condition', input: '', cases: [] } as ConditionStep
      }

      setNodes(nds => [...nds, newNode])
    },
    [reactFlowInstance, setNodes, setEdges, nodes],
  )

  // ── Drag-to-canvas from toolbar ──
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/workflow-node') as WorkflowStep['type']
      if (!type) return
      handleAddNode(type, { x: event.clientX, y: event.clientY })
    },
    [handleAddNode],
  )

  // ── Update node data from child editors ──
  const handleNodeUpdate = useCallback(
    (nodeId: string, data: Partial<WorkflowNodeData>) => {
      setNodes(nds =>
        nds.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)),
      )
      // Sync selectedNode so the property panel reflects input changes immediately
      setSelectedNode(prev =>
        prev?.id === nodeId
          ? { ...prev, data: { ...prev.data, ...data } }
          : prev,
      )
    },
    [setNodes, setSelectedNode],
  )

  // ── Save ──
  const handleSave = useCallback(async () => {
    setError(null)
    setSaving(true)
    try {
      const convertedSteps = reactFlowToSteps(nodes, edges)

      for (const step of convertedSteps) {
        if (step.type === 'llm_call' && !step.prompt) {
          setError(t('LLM step requires a prompt'))
          return
        }
        if (step.type === 'tool_call' && !step.tool) {
          setError(t('Tool step requires a tool name'))
          return
        }
        if (step.type === 'condition') {
          if (!step.input) {
            setError(t('Condition step requires an input variable'))
            return
          }
          if (step.cases.length === 0) {
            setError(t('Condition step requires at least one case'))
            return
          }
        }
      }

      const ok = await updateAppSpec(appId, { steps: convertedSteps })
      if (ok) {
        setSaveSuccess(true)
        originalStepsRef.current = JSON.stringify(convertedSteps)
        setTimeout(() => setSaveSuccess(false), 2000)
      } else {
        setError(t('Failed to save workflow'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }, [nodes, edges, appId, updateAppSpec, t])

  // ── Reset ──
  const handleReset = useCallback(() => {
    const { nodes: n, edges: e } = stepsToReactFlow(steps)
    setNodes(n)
    setEdges(e)
    setSelectedNode(null)
    setError(null)
    setSaveSuccess(false)
  }, [steps, setNodes, setEdges])

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Mobile fallback */}
      <div className="flex items-center justify-center h-full sm:hidden px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {t('Workflow editor is only available on desktop. Please open this page on a larger screen.')}
        </p>
      </div>

      {/* Desktop editor */}
      <div className="hidden sm:flex sm:flex-col sm:h-full" style={{ minHeight: 0 }}>
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 p-3 border-b border-border bg-muted/20 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            {([
              { type: 'llm_call' as const, icon: Brain, label: t('LLM'), title: t('Add LLM Call step') },
              { type: 'tool_call' as const, icon: Wrench, label: t('Tool'), title: t('Add Tool Call step') },
              { type: 'condition' as const, icon: GitBranch, label: t('Condition'), title: t('Add Condition step') },
            ]).map(({ type, icon: Icon, label, title }) => (
              <button
                key={type}
                onClick={() => handleAddNode(type)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/workflow-node', type)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-foreground bg-secondary hover:bg-secondary/80 border border-border rounded-md transition-colors cursor-grab active:cursor-grabbing"
                title={title}
              >
                <Icon className="w-3.5 h-3.5 text-primary" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            {error && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {error}
              </span>
            )}
            {saveSuccess && (
              <span className="text-xs text-primary">{t('Saved')}</span>
            )}
            <button
              onClick={handleReset}
              disabled={!hasChanges}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors disabled:opacity-40"
              title={t('Reset to saved state')}
            >
              <RotateCcw className="w-3 h-3" />
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              {t('Save')}
            </button>
          </div>
        </div>

        {/* Editor area: canvas + property panel */}
        <div className="flex flex-1" style={{ minHeight: 0 }}>
          {/* React Flow canvas */}
          <div ref={reactFlowWrapper} className="flex-1" style={{ minHeight: 0 }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              connectionLineType={ConnectionLineType.SmoothStep}
              connectionLineStyle={{
                stroke: 'hsl(var(--primary))',
                strokeWidth: 2,
                strokeDasharray: '5 3',
              }}
              onNodeClick={onNodeClick}
              onSelectionChange={onSelectionChange}
              onInit={setReactFlowInstance}
              onDragOver={onDragOver}
              onDrop={onDrop}
              nodeTypes={nodeTypes}
              selectionMode={SelectionMode.Partial}
              fitView
              connectionRadius={30}
              proOptions={{ hideAttribution: true }}
              deleteKeyCode={['Backspace', 'Delete']}
              multiSelectionKeyCode="Shift"
              defaultEdgeOptions={{
                animated: true,
                markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' },
                style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
                labelStyle: { fontSize: 10, fill: 'var(--muted-foreground)' },
              }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color="var(--border)"
              />
              <Controls
                className="[&_button]:!bg-background [&_button]:!border [&_button]:!border-border [&_button]:!text-foreground [&_button]:hover:!bg-secondary"
              />
              <MiniMap
                pannable
                zoomable
                style={{ background: 'var(--background)' }}
                nodeColor={(node) => {
                  if (node.type === 'llm_call') return '#818cf8'
                  if (node.type === 'tool_call') return '#4ade80'
                  if (node.type === 'condition') return '#c084fc'
                  return '#94a3b8'
                }}
                nodeStrokeColor={(node) => {
                  if (node.type === 'llm_call') return '#6366f1'
                  if (node.type === 'tool_call') return '#22c55e'
                  if (node.type === 'condition') return '#a855f7'
                  return '#64748b'
                }}
                nodeStrokeWidth={2}
                nodeBorderRadius={8}
                maskColor="var(--muted-foreground/10)"
                className="!border !border-border"
              />
            </ReactFlow>
          </div>

          {/* Property panel */}
          {selectedNode && (
            <NodePropertyPanel
              node={selectedNode}
              onUpdate={handleNodeUpdate}
              onClose={handlePanelClose}
            />
          )}
        </div>
      </div>
    </div>
  )
}