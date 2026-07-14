/**
 * WorkflowReplay
 *
 * Execution replay panel for automation (digital human) apps.
 * Shows a list of past workflow runs with their node-level execution details.
 *
 * Visual structure:
 *   Top: run selector (reverse-chronological list of runs)
 *   Bottom: selected run's node execution flow with step-by-step details
 */
import { useEffect } from 'react'
import { Clock, CheckCircle, XCircle, SkipForward, Loader2, AlertCircle, History } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow.store'
import { useTranslation } from '../../i18n'
import type { WorkflowRun, WorkflowNodeRun } from '../../api/workflow.api'

interface WorkflowReplayProps {
  appId: string
}

export function WorkflowReplay({ appId }: WorkflowReplayProps) {
  const { t } = useTranslation()
  const { runs, selectedRun, nodeRuns, isLoading, isNodeLoading, error, loadRuns, selectRun } = useWorkflowStore()

  useEffect(() => {
    loadRuns(appId)
  }, [appId, loadRuns])

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const formatDuration = (ms?: number): string => {
    if (ms == null) return '—'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    const mins = Math.floor(ms / 60000)
    const secs = Math.floor((ms % 60000) / 1000)
    return `${mins}m ${secs}s`
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-primary" />
      case 'error': return <XCircle className="w-4 h-4 text-destructive" />
      case 'running': return <Loader2 className="w-4 h-4 text-primary animate-spin" />
      case 'skipped': return <SkipForward className="w-4 h-4 text-muted-foreground/50" />
      default: return <Clock className="w-4 h-4 text-muted-foreground" />
    }
  }

  const nodeStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'border-primary/30 bg-primary/5'
      case 'error': return 'border-destructive/30 bg-destructive/5'
      case 'running': return 'border-primary/30 bg-primary/5'
      case 'skipped': return 'border-border bg-muted/30 opacity-60'
      default: return 'border-border bg-muted/30'
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-destructive bg-destructive/5 border-b border-destructive/20">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <History className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">{t('No run history yet')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {t('Run history will appear here after the app executes')}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Run list */}
          <div className="w-52 flex-shrink-0 border-r border-border overflow-y-auto">
            <div className="py-2">
              {runs.map(run => (
                <button
                  key={run.runId}
                  onClick={() => selectRun(run)}
                  className={`w-full text-left px-3 py-2.5 border-b border-border last:border-b-0 transition-colors ${
                    selectedRun?.runId === run.runId
                      ? 'bg-secondary/60'
                      : 'hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {statusIcon(run.status)}
                    <span className="text-xs font-medium text-foreground truncate">
                      {run.triggerType}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {formatTime(run.startedAt)}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60">
                    {formatDuration(run.durationMs)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Node run details */}
          <div className="flex-1 overflow-y-auto">
            {selectedRun && (
              <div className="px-4 py-3 border-b border-border bg-muted/20">
                <div className="flex items-center gap-2 mb-1">
                  {statusIcon(selectedRun.status)}
                  <span className="text-xs font-semibold text-foreground">{t('Run')}</span>
                  <code className="text-[11px] text-muted-foreground font-mono">
                    {selectedRun.runId.slice(0, 8)}
                  </code>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{t('Trigger')}: {selectedRun.triggerType}</span>
                  <span>{t('Duration')}: {formatDuration(selectedRun.durationMs)}</span>
                  {selectedRun.finishedAt && (
                    <span>{t('Finished')}: {formatTime(selectedRun.finishedAt)}</span>
                  )}
                </div>
                {selectedRun.errorMessage && (
                  <p className="text-[11px] text-destructive mt-1">{selectedRun.errorMessage}</p>
                )}
              </div>
            )}

            {isNodeLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : nodeRuns.length === 0 && selectedRun ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-xs text-muted-foreground">{t('No node details available')}</p>
              </div>
            ) : (
              <div className="py-3 px-4 space-y-2">
                {nodeRuns.map(node => (
                  <NodeRunCard key={node.id} node={node} formatDuration={formatDuration} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Node Run Card
// ──────────────────────────────────────────────

interface NodeRunCardProps {
  node: WorkflowNodeRun
  formatDuration: (ms?: number) => string
}

function NodeRunCard({ node, formatDuration }: NodeRunCardProps) {
  const { t } = useTranslation()

  const colors = (() => {
    switch (node.status) {
      case 'completed': return 'border-primary/30 bg-primary/5'
      case 'error': return 'border-destructive/30 bg-destructive/5'
      case 'running': return 'border-primary/30 bg-primary/5'
      case 'skipped': return 'border-border bg-muted/30 opacity-60'
      default: return 'border-border bg-muted/30'
    }
  })()

  const icon = (() => {
    switch (node.status) {
      case 'completed': return <CheckCircle className="w-3.5 h-3.5 text-primary" />
      case 'error': return <XCircle className="w-3.5 h-3.5 text-destructive" />
      case 'running': return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
      case 'skipped': return <SkipForward className="w-3.5 h-3.5 text-muted-foreground/50" />
      default: return <Clock className="w-3.5 h-3.5 text-muted-foreground" />
    }
  })()

  return (
    <div className={`rounded-lg border ${colors} p-3 transition-colors`}>
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <span className="text-xs font-medium text-foreground font-mono">{node.stepId}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wider">
          {node.stepType}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {formatDuration(node.durationMs)}
        </span>
      </div>

      {node.input && Object.keys(node.input).length > 0 && (
        <div className="mt-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t('Input')}</span>
          <pre className="mt-0.5 text-[11px] text-muted-foreground bg-muted/50 rounded p-1.5 overflow-x-auto max-h-24">
            {JSON.stringify(node.input, null, 1)}
          </pre>
        </div>
      )}

      {node.output && Object.keys(node.output).length > 0 && (
        <div className="mt-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t('Output')}</span>
          <pre className="mt-0.5 text-[11px] text-muted-foreground bg-muted/50 rounded p-1.5 overflow-x-auto max-h-24">
            {JSON.stringify(node.output, null, 1)}
          </pre>
        </div>
      )}
    </div>
  )
}