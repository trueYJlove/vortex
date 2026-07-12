/**
 * NodePropertyPanel — side panel for editing workflow step properties.
 *
 * Appears when a node is selected in the WorkflowEditor. Provides
 * type-specific form fields for llm_call, tool_call, and condition steps.
 *
 * Must NOT use memo — the step object is recreated on every update and
 * memo would prevent the input fields from reflecting typed values.
 */
import { useCallback } from 'react'
import { X, HelpCircle, Info } from 'lucide-react'
import type { Node } from '@xyflow/react'
import type { WorkflowNodeData } from '../workflow-utils'
import type { LlmCallStep, ToolCallStep, ConditionStep, ConditionCase } from '../../../../shared/apps/spec-types'
import { useTranslation } from '../../i18n'

interface NodePropertyPanelProps {
  node: Node<WorkflowNodeData> | null
  onUpdate: (nodeId: string, data: Partial<WorkflowNodeData>) => void
  onClose: () => void
}

export function NodePropertyPanel(
  { node, onUpdate, onClose }: NodePropertyPanelProps,
) {
  const { t } = useTranslation()

  const handleStepUpdate = useCallback(
    (patch: Partial<LlmCallStep | ToolCallStep | ConditionStep>) => {
      if (!node) return
      const updated = { ...node.data.step, ...patch }
      onUpdate(node.id, { step: updated } as Partial<WorkflowNodeData>)
    },
    [node, onUpdate],
  )

  if (!node) return null

  const step = node.data.step

  return (
    <div className="w-72 border-l border-border bg-background flex flex-col flex-shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/20">
        <span className="text-xs font-medium text-foreground">{t('Properties')}</span>
        <button
          onClick={onClose}
          className="p-0.5 text-muted-foreground hover:text-foreground rounded"
          title={t('Close')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Step ID */}
      <div className="px-3 py-2 border-b border-border/50">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {t('Step ID')}
        </label>
        <code className="block mt-0.5 text-xs font-mono text-foreground">
          {step.id}
        </code>
      </div>

      {/* Type-specific fields */}
      {step.type === 'llm_call' && (
        <LlmCallFields step={step} onUpdate={handleStepUpdate} />
      )}
      {step.type === 'tool_call' && (
        <ToolCallFields step={step} onUpdate={handleStepUpdate} />
      )}
      {step.type === 'condition' && (
        <ConditionFields step={step} onUpdate={handleStepUpdate} />
      )}
    </div>
  )
}

// ── LLM Call Fields ──

interface LlmCallFieldsProps {
  step: LlmCallStep
  onUpdate: (patch: Partial<LlmCallStep>) => void
}

const LlmCallFields = ({ step, onUpdate }: LlmCallFieldsProps) => {
  const { t } = useTranslation()

  return (
    <div className="px-3 py-2 space-y-4">
      {/* Prompt */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {t('Prompt')}
          </label>
          <span className="text-[10px] text-destructive">*</span>
          <div className="group relative ml-auto">
            <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
            <div className="absolute right-0 top-4 w-56 p-2 bg-popover border border-border rounded-md shadow-md text-[10px] text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {t('Tell the AI what to do. You can reference outputs from previous steps, e.g. ${step_1.llm_result}')}
            </div>
          </div>
        </div>
        <textarea
          value={step.prompt}
          onChange={(e) => onUpdate({ prompt: e.target.value })}
          rows={6}
          className="mt-1 w-full text-xs font-mono bg-muted/30 border border-border rounded px-2 py-1.5 text-foreground resize-y min-h-[80px] focus:outline-none focus:border-primary"
          placeholder={t('e.g. Please summarize: ${step_1.llm_result}')}
        />
      </div>

      {/* Tools */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {t('Tools')}
          </label>
          <div className="group relative ml-auto">
            <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
            <div className="absolute right-0 top-4 w-56 p-2 bg-popover border border-border rounded-md shadow-md text-[10px] text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {t('Optional. Specify tool names (MCP tools) the AI can call, separated by commas. The AI decides whether to call them during execution.')}
            </div>
          </div>
        </div>
        <ToolsEditor
          tools={step.tools ?? []}
          onChange={(tools) => onUpdate({ tools })}
        />
      </div>
    </div>
  )
}

// ── Tool Call Fields ──

interface ToolCallFieldsProps {
  step: ToolCallStep
  onUpdate: (patch: Partial<ToolCallStep>) => void
}

const ToolCallFields = ({ step, onUpdate }: ToolCallFieldsProps) => {
  const { t } = useTranslation()

  const handleParamsChange = useCallback(
    (raw: string) => {
      try {
        const parsed = JSON.parse(raw)
        onUpdate({ params: parsed })
      } catch {
        // Keep invalid JSON — user is still typing
      }
    },
    [onUpdate],
  )

  return (
    <div className="px-3 py-2 space-y-4">
      {/* Tool name */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {t('Tool Name')}
          </label>
          <span className="text-[10px] text-destructive">*</span>
          <div className="group relative ml-auto">
            <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
            <div className="absolute right-0 top-4 w-56 p-2 bg-popover border border-border rounded-md shadow-md text-[10px] text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {t('The tool name to call. Must exactly match the MCP tool name configured in the app.')}
            </div>
          </div>
        </div>
        <input
          type="text"
          value={step.tool}
          onChange={(e) => onUpdate({ tool: e.target.value })}
          className="mt-1 w-full text-xs font-mono bg-muted/30 border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:border-primary"
          placeholder={t('e.g. search_web, send_email')}
        />
      </div>

      {/* Params */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {t('Params (JSON)')}
          </label>
          <div className="group relative ml-auto">
            <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
            <div className="absolute right-0 top-4 w-56 p-2 bg-popover border border-border rounded-md shadow-md text-[10px] text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {t('JSON parameters passed to the tool. e.g. {"query": "..."}. Values can reference previous step outputs, e.g. ${step_1.llm_result}.')}
            </div>
          </div>
        </div>
        <textarea
          value={JSON.stringify(step.params ?? {}, null, 2)}
          onChange={(e) => {
            if (!e.target.value.trim()) {
              onUpdate({ params: undefined })
              return
            }
            try {
              const parsed = JSON.parse(e.target.value)
              onUpdate({ params: parsed })
            } catch {
              // Keep invalid JSON — user is still typing
            }
          }}
          rows={6}
          className="mt-1 w-full text-xs font-mono bg-muted/30 border border-border rounded px-2 py-1.5 text-foreground resize-y min-h-[80px] focus:outline-none focus:border-primary"
          placeholder={t('{"key": "value", "query": "${step_1.llm_result}"}')}
        />
      </div>
    </div>
  )
}

// ── Condition Fields ──

interface ConditionFieldsProps {
  step: ConditionStep
  onUpdate: (patch: Partial<ConditionStep>) => void
}

const ConditionFields = ({ step, onUpdate }: ConditionFieldsProps) => {
  const { t } = useTranslation()

  const addCase = useCallback(() => {
    onUpdate({
      cases: [...step.cases, { when: { eq: '' }, goto: '' }],
    })
  }, [step.cases, onUpdate])

  const updateCase = useCallback(
    (index: number, patch: Partial<ConditionCase>) => {
      const updated = step.cases.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      )
      onUpdate({ cases: updated })
    },
    [step.cases, onUpdate],
  )

  const removeCase = useCallback(
    (index: number) => {
      onUpdate({ cases: step.cases.filter((_, i) => i !== index) })
    },
    [step.cases, onUpdate],
  )

  const updateCaseOperator = useCallback(
    (index: number, operator: string) => {
      const c = step.cases[index]
      const newWhen: ConditionCase['when'] = { [operator]: c.when[Object.keys(c.when)[0] as keyof typeof c.when] ?? '' }
      updateCase(index, { when: newWhen })
    },
    [step.cases, updateCase],
  )

  const updateCaseValue = useCallback(
    (index: number, value: string) => {
      const c = step.cases[index]
      const operator = Object.keys(c.when)[0]
      const newWhen: ConditionCase['when'] = { [operator]: value }
      updateCase(index, { when: newWhen })
    },
    [step.cases, updateCase],
  )

  const operators: { value: string; labelKey: string }[] = [
    { value: 'eq', labelKey: 'Equals (eq)' },
    { value: 'neq', labelKey: 'Not equals (neq)' },
    { value: 'contains', labelKey: 'Contains (contains)' },
    { value: 'matches', labelKey: 'Regex match (matches)' },
    { value: 'gt', labelKey: 'Greater than (gt)' },
    { value: 'lt', labelKey: 'Less than (lt)' },
    { value: 'gte', labelKey: 'Greater or equal (gte)' },
    { value: 'lte', labelKey: 'Less or equal (lte)' },
  ]

  return (
    <div className="px-3 py-2 space-y-4">
      {/* Input variable guide */}
      <div className="bg-muted/30 border border-border/50 rounded-md p-2.5 space-y-1">
        <div className="flex items-center gap-1.5 text-primary">
          <Info className="w-3 h-3" />
          <span className="text-[10px] font-medium">{t('Condition Node')}</span>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {t('The condition node evaluates the output from the previous step to decide which branch to take. You need to: 1. Specify the input variable; 2. Add case conditions; 3. Set a default target.')}
        </p>
      </div>

      {/* Input variable */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {t('Input Variable')}
          </label>
          <span className="text-[10px] text-destructive">*</span>
          <div className="group relative ml-auto">
            <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
            <div className="absolute right-0 top-4 w-56 p-2 bg-popover border border-border rounded-md shadow-md text-[10px] text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {t('The variable to evaluate, referencing a previous step output. e.g. ${step_1.llm_result} uses the LLM output from step_1.')}
            </div>
          </div>
        </div>
        <input
          type="text"
          value={step.input}
          onChange={(e) => onUpdate({ input: e.target.value })}
          className="mt-1 w-full text-xs font-mono bg-muted/30 border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:border-primary"
          placeholder={'${step_1.llm_result}'}
        />
      </div>

      {/* Cases */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {t('Cases')}
            </label>
            <span className="text-[10px] text-destructive">*</span>
            <div className="group relative">
              <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
              <div className="absolute left-4 top-4 w-56 p-2 bg-popover border border-border rounded-md shadow-md text-[10px] text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {t('Each case defines a condition — when matched, execution jumps to the specified step. Cases are evaluated top-to-bottom; the first match wins.')}
              </div>
            </div>
          </div>
          {step.cases.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {step.cases.length}
            </span>
          )}
        </div>

        {step.cases.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic mb-1.5">
            {t('No cases defined')}
          </p>
        )}

        {step.cases.map((c, i) => {
          const operator = Object.keys(c.when)[0] || 'eq'
          return (
            <div
              key={i}
              className="flex items-start gap-1 mb-1.5 p-1.5 bg-muted/20 border border-border/50 rounded"
            >
              <div className="flex-1 space-y-1 min-w-0">
                {/* Operator select */}
                <select
                  value={operator}
                  onChange={(e) => updateCaseOperator(i, e.target.value)}
                  className="w-full text-[10px] bg-muted border border-border rounded px-1 py-0.5 text-foreground focus:outline-none focus:border-primary"
                >
                  {operators.map((op) => (
                    <option key={op.value} value={op.value}>
                      {t(op.labelKey)}
                    </option>
                  ))}
                </select>
                {/* Value */}
                <input
                  type="text"
                  value={String(c.when[operator as keyof typeof c.when] ?? '')}
                  onChange={(e) => updateCaseValue(i, e.target.value)}
                  className="w-full text-[10px] font-mono bg-muted/30 border border-border rounded px-1 py-0.5 text-foreground focus:outline-none focus:border-primary"
                  placeholder={t('Comparison value')}
                />
                {/* Goto */}
                <input
                  type="text"
                  value={c.goto}
                  onChange={(e) => updateCase(i, { goto: e.target.value })}
                  className="w-full text-[10px] font-mono bg-muted/30 border border-border rounded px-1 py-0.5 text-foreground focus:outline-none focus:border-primary"
                  placeholder={t('Target step ID (e.g. step_3)')}
                />
              </div>
              <button
                onClick={() => removeCase(i)}
                className="p-0.5 text-muted-foreground hover:text-destructive flex-shrink-0 mt-0.5"
                title={t('Remove case')}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )
        })}

        <button
          onClick={addCase}
          className="text-[11px] text-primary hover:text-primary/80 transition-colors"
        >
          + {t('Add case')}
        </button>
      </div>

      {/* Default target */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {t('Default Target')}
          </label>
          <div className="group relative ml-auto">
            <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
            <div className="absolute right-0 top-4 w-56 p-2 bg-popover border border-border rounded-md shadow-md text-[10px] text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {t('Optional. The default step to jump to when no case matches. If unset and no case matches, the workflow stops with an error.')}
            </div>
          </div>
        </div>
        <input
          type="text"
          value={step.default ?? ''}
          onChange={(e) => onUpdate({ default: e.target.value || undefined })}
          className="mt-1 w-full text-xs font-mono bg-muted/30 border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:border-primary"
          placeholder={t('Step ID (e.g. step_3, leave empty to error on no match)')}
        />
      </div>
    </div>
  )
}

// ── Tools Editor (shared by LLM Call) ──

interface ToolsEditorProps {
  tools: string[]
  onChange: (tools: string[]) => void
}

const ToolsEditor = ({ tools, onChange }: ToolsEditorProps) => {
  const { t } = useTranslation()

  const addTool = useCallback(() => {
    onChange([...tools, ''])
  }, [tools, onChange])

  const updateTool = useCallback(
    (index: number, value: string) => {
      onChange(tools.map((t, i) => (i === index ? value : t)))
    },
    [tools, onChange],
  )

  const removeTool = useCallback(
    (index: number) => {
      onChange(tools.filter((_, i) => i !== index))
    },
    [tools, onChange],
  )

  return (
    <div className="mt-1 space-y-1">
      {tools.map((tool, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="text"
            value={tool}
            onChange={(e) => updateTool(i, e.target.value)}
            className="flex-1 text-[10px] font-mono bg-muted/30 border border-border rounded px-1.5 py-1 text-foreground focus:outline-none focus:border-primary"
            placeholder={t('Tool name (e.g. search_web)')}
          />
          <button
            onClick={() => removeTool(i)}
            className="p-0.5 text-muted-foreground hover:text-destructive flex-shrink-0"
            title={t('Remove tool')}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ))}
      <button
        onClick={addTool}
        className="text-[11px] text-primary hover:text-primary/80 transition-colors"
      >
        + {t('Add tool')}
      </button>
    </div>
  )
}