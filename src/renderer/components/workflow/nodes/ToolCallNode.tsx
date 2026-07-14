/**
 * ToolCallNode — React Flow custom node for tool_call workflow steps.
 *
 * Shows step id, the tool name, and a compact params preview.
 */
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Wrench } from 'lucide-react'
import type { WorkflowNodeData } from '../workflow-utils'
import { useTranslation } from '../../../i18n'

// i18n static keys for extraction (DO NOT REMOVE)
// prettier-ignore
void function _i18nToolCallNodeKeys(t: (k: string) => string) {
  t('Tool'); t('(tool not set)')
}

export const ToolCallNode = memo(
  ({ data, selected }: NodeProps<WorkflowNodeData>) => {
    const { t } = useTranslation()
    const step = data.step
    if (step.type !== 'tool_call') return null

    const hasParams =
      step.params && Object.keys(step.params).length > 0

    return (
      <div
        className={`relative overflow-visible rounded-lg border bg-background min-w-[200px] max-w-[260px] transition-shadow ${
          selected ? 'border-primary shadow-md' : 'border-border shadow-sm'
        }`}
      >
        <Handle
          type="target"
          position={Position.Top}
          id="target"
          isConnectable={true}
          style={{
            background: 'var(--background)',
            border: '3px solid hsl(var(--primary))',
            width: 22,
            height: 22,
          }}
        />

        {/* Header */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-primary/5 rounded-t-lg">
          <Wrench className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-mono font-medium text-foreground">
            {step.id}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wider ml-auto">
            {t('Tool')}
          </span>
        </div>

        {/* Tool name */}
        <div className="px-3 py-2">
          <span className="text-xs font-medium text-foreground">
            {step.tool || t('(tool not set)')}
          </span>
        </div>

        {/* Params preview */}
        {hasParams && (
          <div className="px-3 pb-2">
            <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded p-1.5 overflow-x-auto max-h-16">
              {JSON.stringify(step.params, null, 1)}
            </pre>
          </div>
        )}

        <Handle
          type="source"
          position={Position.Bottom}
          id="source"
          isConnectable={true}
          style={{
            background: 'hsl(var(--primary))',
            border: '3px solid hsl(var(--primary))',
            width: 22,
            height: 22,
          }}
        />
      </div>
    )
  },
)
ToolCallNode.displayName = 'ToolCallNode'
