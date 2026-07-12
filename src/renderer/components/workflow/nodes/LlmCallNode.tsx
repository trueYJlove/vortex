/**
 * LlmCallNode — React Flow custom node for llm_call workflow steps.
 *
 * Shows step id, prompt preview (truncated at 80 chars), and any tool
 * references as small badge pills.
 */
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Brain, Sparkles } from 'lucide-react'
import type { WorkflowNodeData } from '../workflow-utils'
import { useTranslation } from '../../../i18n'

// i18n static keys for extraction (DO NOT REMOVE)
// prettier-ignore
void function _i18nLlmCallNodeKeys(t: (k: string) => string) {
  t('LLM'); t('(empty prompt)')
}

export const LlmCallNode = memo(
  ({ data, selected }: NodeProps<WorkflowNodeData>) => {
    const { t } = useTranslation()
    const step = data.step
    if (step.type !== 'llm_call') return null

    const promptPreview =
      step.prompt.length > 80
        ? step.prompt.slice(0, 80) + '…'
        : step.prompt || t('(empty prompt)')
    const hasTools = step.tools && step.tools.length > 0

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
          <Brain className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-mono font-medium text-foreground">
            {step.id}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wider ml-auto">
            {t('LLM')}
          </span>
        </div>

        {/* Prompt preview */}
        <div className="px-3 py-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {promptPreview}
          </p>
        </div>

        {/* Tool badges */}
        {hasTools && (
          <div className="px-3 pb-2 flex flex-wrap gap-1">
            {step.tools!.map((tool) => (
              <span
                key={tool}
                className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-0.5"
              >
                <Sparkles className="w-2.5 h-2.5" />
                {tool}
              </span>
            ))}
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
LlmCallNode.displayName = 'LlmCallNode'
