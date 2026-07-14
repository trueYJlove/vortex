/**
 * apps/runtime/workflow -- Database Migrations
 *
 * Schema for workflow execution: workflow_runs + workflow_node_runs.
 * Uses its own namespace separate from the activity layer migrations.
 */

import type { Migration } from '../../../platform/store/types'

export const WORKFLOW_MIGRATION_NAMESPACE = 'app_runtime_workflow'

export const workflowMigrations: Migration[] = [
  {
    version: 1,
    description: 'Create workflow_runs and workflow_node_runs tables',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_runs (
          run_id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'running',
          trigger_type TEXT NOT NULL,
          trigger_data_json TEXT,
          flow_definition_json TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          finished_at INTEGER,
          duration_ms INTEGER,
          error_message TEXT,
          FOREIGN KEY (app_id) REFERENCES installed_apps(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_workflow_runs_app ON workflow_runs(app_id, started_at DESC);

        CREATE TABLE IF NOT EXISTS workflow_node_runs (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          app_id TEXT NOT NULL,
          step_id TEXT NOT NULL,
          step_type TEXT NOT NULL,
          status TEXT NOT NULL,
          input_json TEXT,
          output_json TEXT,
          error_message TEXT,
          started_at INTEGER NOT NULL,
          finished_at INTEGER,
          duration_ms INTEGER,
          FOREIGN KEY (run_id) REFERENCES workflow_runs(run_id) ON DELETE CASCADE,
          FOREIGN KEY (app_id) REFERENCES installed_apps(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_run ON workflow_node_runs(run_id, started_at ASC);
      `)
    },
  },
]
