/**
 * ConditionNode — React Flow custom node for condition workflow steps.
 *
 * Shows step id, the input-variable reference, each case as a compact row,
 * and the optional default target.
 */
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { GitBranch } from 'lucide-react'
import type { WorkflowNodeData } from '../workflow-utils'
import { useTranslation } from '../../../i18n'

// i18n static keys for extraction (DO NOT REMOVE)
// prettier-ignore
void function _i18nConditionNodeKeys(t: (k: string) => string) {
  t('If'); t('Input'); t('Cases'); t('Default'); t('(no cases defined)'); t('(not set)')
}

export const ConditionNode = memo(
  ({ data, selected }: NodeProps<WorkflowNodeData>) => {
    const { t } = useTranslation()
    const step = data.step
    if (step.type !== 'condition') return null

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
          <GitBranch className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-mono font-medium text-foreground">
            {step.id}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wider ml-auto">
            {t('If')}
          </span>
        </div>

        {/* Input variable */}
        <div className="px-3 py-2 border-b border-border/50">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {t('Input')}
          </span>
          <code className="block mt-0.5 text-xs font-mono text-foreground">
            {step.input || t('(not set)')}
          </code>
        </div>

        {/* Cases */}
        {step.cases.length > 0 && (
          <div className="px-3 py-2 space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {t('Cases')}
            </span>
            {step.cases.map((c, i) => {
              const operator = Object.keys(c.when)[0]
              const value = c.when[operator as keyof typeof c.when]
              return (
                <div
                  key={i}
                  className="flex items-center gap-1.5 text-[11px] text-foreground"
                >
                  <span className="text-primary font-medium">
                    {operator}
                  </span>
                  <span className="text-muted-foreground">
                    {String(value ?? '')}
                  </span>
                  <span className="text-muted-foreground/50">→</span>
                  <code className="text-muted-foreground font-mono">
                    {c.goto}
                  </code>
                </div>
              )
            })}
          </div>
        )}

        {/* Default target */}
        {step.default && (
          <div className="px-3 pb-2">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {t('Default')}
            </span>
            <div className="flex items-center gap-1.5 text-[11px] text-foreground mt-0.5">
              <span className="text-muted-foreground/50">→</span>
              <code className="text-muted-foreground font-mono">
                {step.default}
              </code>
            </div>
          </div>
        )}

        {/* Empty state */}
        {step.cases.length === 0 && !step.default && (
          <div className="px-3 py-2">
            <p className="text-[11px] text-muted-foreground italic">
              {t('(no cases defined)')}
            </p>
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
ConditionNode.displayName = 'ConditionNode'
