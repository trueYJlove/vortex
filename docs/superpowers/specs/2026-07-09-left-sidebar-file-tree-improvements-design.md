# Left Sidebar File Tree Improvements — Design

## Background

The left sidebar (`ArtifactRail`) currently has two UX issues:

1. **"Open Browser" and "Open Folder" buttons live in the footer**, separated from the file tree toolbar (new file, new folder, refresh). This creates an unintuitive layout — primary actions are split across different visual zones.
2. **No git status visibility** — users cannot see which files have been modified, added, or deleted without running git commands manually. The right sidebar already has a persistent task plan panel; the left sidebar needs a similar persistent git changes panel.

## Goal

1. Consolidate all action buttons into the file tree toolbar header.
2. Add a persistent git changes panel below the file tree, mirroring the right sidebar's task plan panel pattern (default height, drag-to-resize, collapsible).

## Non-Goals

- No git decorations on individual tree nodes (file coloring by status). That's a separate feature.
- No git operations (stage, commit, revert) — display only.
- No git watcher / real-time polling — refresh only on AI response completion.
- No changes to the right sidebar.

## Architecture

### Part 1: Button Migration

Move "Open Browser" (`Globe`) and "Open Folder" (`FolderOpen`) from `ArtifactRail.renderFooter()` to `ArtifactTree` toolbar.

**ArtifactTree toolbar (after)**:
```
[FolderName] ---- [Globe][FolderOpen][FilePlus][FolderPlus][RefreshCw]
```

All buttons are icon-only with tooltip (consistent with existing three buttons). The `handleOpenBrowser` and `handleOpenFolder` callbacks are passed from `ArtifactRail` to `ArtifactTree` via props.

`ArtifactRail.renderFooter()` is removed entirely once both buttons are relocated.

### Part 2: Git RPC Layer

New files follow the existing IPC contract pattern (contract → IPC handler → service).

#### Contract

`src/shared/rpc/contracts/git.contract.ts`

```typescript
export interface GitFileStatus {
  path: string
  relativePath: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
}

export interface GitStatusResult {
  branch: string | null
  files: GitFileStatus[]
}

export interface GitContract {
  'git:status': {
    params: { spaceId: string }
    return: GitStatusResult
  }
}
```

#### Service

`src/main/services/git.service.ts`

- `getGitStatus(spacePath: string): Promise<GitStatusResult>`
- Executes `git status --porcelain -b` in the space directory
- Parses porcelain output: `M` → modified, `A` → added, `D` → deleted, `R` → renamed, `??` → untracked
- Returns `{ branch: null, files: [] }` for non-git directories (no error thrown)

#### IPC Handler

`src/main/ipc/git.ts`

- Registers `git:status` handler
- Resolves spaceId → spacePath, calls `getGitStatus(spacePath)`

#### Transport Sync

- `src/preload/index.ts` — expose `gitStatus(params)` method
- `src/renderer/api/index.ts` — add `api.gitStatus(spaceId)` call

### Part 3: GitChangesPanel

`src/renderer/components/artifact/GitChangesPanel.tsx`

Pattern: directly mirrors `PersistentTaskPlanPanel` (always mounted, drag-to-resize, collapsible, empty state).

#### Constants

```typescript
const MIN_HEIGHT = 120
const MAX_HEIGHT = 600
const DEFAULT_HEIGHT = 240
```

#### Visual States

**Has changes**:
```
┌─────────────────────────────────────┐  ← drag handle
│ [GitBranch] 变更文件 (3)        [▼] │  ← title row (click to collapse)
│  M  src/foo.ts                      │
│  M  src/bar.ts                      │  ← file list
│  A  src/new-file.ts                 │
└─────────────────────────────────────┘
```

**Empty (no changes)**:
```
┌─────────────────────────────────────┐  ← drag handle
│ [GitBranch] 变更文件 (0)        [▼] │  ← title row
│       没有未提交的更改              │  ← empty hint
└─────────────────────────────────────┘
```

#### Status Indicators

| Status | Label | Color |
|--------|-------|-------|
| modified | `M` | `text-yellow-500` |
| added | `A` | `text-green-500` |
| deleted | `D` | `text-red-500` |
| renamed | `R` | `text-blue-500` |
| untracked | `?` | `text-muted-foreground` |

#### Interaction

| Action | Behavior |
|--------|----------|
| Click file | Locate and select in file tree (`treeRef.current?.select(id)` or path-based lookup) |
| Click title row | Toggle collapse |
| Drag handle | Resize panel, persist to `useAppStore.config.layout.gitChangesHeight` |
| AI response ends | Auto-refresh git status |

### Part 4: Refresh Mechanism

`src/renderer/hooks/useGitStatus.ts`

- Custom hook: `useGitStatus(spaceId)`
- Returns `{ files, branch, refresh, isEmpty }`
- Calls `api.gitStatus(spaceId)` on mount and when `refresh()` is invoked
- `refresh()` is exposed for external triggering

**Trigger point**: AI response completion.

When the chat stream finishes (agent response complete), call `useGitStatus.refresh()`. This connects to the existing chat store mechanism — the renderer already detects when a response is complete. The hook listens for this state change and triggers a refresh.

### Part 5: Layout Integration

`ArtifactRail.tsx` main layout (expanded mode):

```
ArtifactRail
  ├── Header: "Workspace" + collapse toggle
  ├── <ArtifactTree>            (flex-1, takes remaining space)
  │    ├── Toolbar: [Globe][FolderOpen][FilePlus][FolderPlus][RefreshCw]
  │    └── <Tree> (react-arborist)
  ├── <GitChangesPanel>         (fixed/adjustable height, below tree)
  └── (footer removed)
```

## Data Flow

```
AI response completes
  │
  ▼
useGitStatus.refresh()
  │
  ▼
api.gitStatus(spaceId)
  │ IPC: git:status
  ▼
git.service: exec `git status --porcelain -b`
  │ parse output → GitStatusResult
  ▼
GitChangesPanel re-renders
  ├── file list with status badges
  └── title row with count
```

## Change List

| File | Operation | Notes |
|------|-----------|-------|
| `src/shared/rpc/contracts/git.contract.ts` | New | GitFileStatus, GitStatusResult, GitContract types |
| `src/main/services/git.service.ts` | New | `getGitStatus()` — exec + parse `git status --porcelain -b` |
| `src/main/ipc/git.ts` | New | IPC handler for `git:status` |
| `src/main/ipc/index.ts` | Modify | Register git IPC handler |
| `src/preload/index.ts` | Modify | Expose `gitStatus()` method |
| `src/renderer/api/index.ts` | Modify | Add `api.gitStatus()` call |
| `src/renderer/hooks/useGitStatus.ts` | New | Hook for git status data + refresh |
| `src/renderer/components/artifact/GitChangesPanel.tsx` | New | Persistent git changes panel |
| `src/renderer/components/artifact/ArtifactTree.tsx` | Modify | Add Globe/FolderOpen buttons to toolbar; accept handler props |
| `src/renderer/components/artifact/ArtifactRail.tsx` | Modify | Pass handlers to ArtifactTree; remove footer; mount GitChangesPanel |
| `src/renderer/types/index.ts` | Modify | Extend layout config with `gitChangesHeight` |

## Verification

| Scenario | Expected |
|----------|----------|
| Header toolbar shows 5 buttons | Globe, FolderOpen, FilePlus, FolderPlus, RefreshCw — all icon-only |
| Open Browser button click | Opens browser homepage, same behavior as before |
| Open Folder button click | Opens space folder in OS file manager |
| Footer area removed | No footer rendered in expanded/collapsed/mobile modes |
| Git repo with changes | Panel shows file list with status badges and count |
| Git repo, no changes | Panel shows empty hint "没有未提交的更改" |
| Non-git directory | Panel shows empty state (no error) |
| AI response completes | Git status auto-refreshes |
| Click changed file in panel | File selected/located in tree |
| Drag panel height | Resizes smoothly, persists across sessions |
| Collapse/expand panel | Toggle works, state preserved |
| Mobile < 640px | Panel fills sidebar width, no overflow |
| Collapsed sidebar | Panel not visible (same as tree) |

## Risks & Mitigations

- **`git` not in PATH**: `git.service.ts` wraps exec in try/catch; returns empty result on failure. Non-git directories return `{ branch: null, files: [] }`.
- **Large repos**: `git status --porcelain` is fast even for large repos (sub-second). No mitigation needed.
- **Tree node lookup by path**: Clicking a file in git panel needs to find the corresponding tree node. If the node isn't loaded (lazy loading), expand parents first using `relativePath` segments.
- **Responsive mobile**: GitChangesPanel uses same responsive pattern as PersistentTaskPlanPanel — fills sidebar width at < 640px.
