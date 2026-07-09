# Left Sidebar File Tree Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate action buttons into the file tree toolbar and add a persistent git changes panel below the file tree.

**Architecture:** New IPC contract → service → handler → preload → renderer API pipeline for git status. New `GitChangesPanel` component mirroring the existing `PersistentTaskPlanPanel` drag-to-resize pattern. Button migration from `ArtifactRail` footer to `ArtifactTree` toolbar via props.

**Tech Stack:** Electron IPC (contract-based RPC), React, Zustand, Tailwind CSS, `child_process.exec` for git commands

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/shared/rpc/contracts/git.contract.ts` | Git RPC contract definition (types + channel) |
| `src/main/services/git.service.ts` | `getGitStatus()` — execute and parse `git status --porcelain -b` |
| `src/main/ipc/git.ts` | IPC handler registration for `git:status` |
| `src/renderer/hooks/useGitStatus.ts` | Hook: fetch git status, expose refresh, auto-trigger on AI completion |
| `src/renderer/components/artifact/GitChangesPanel.tsx` | Persistent git changes panel with drag-to-resize |
| `src/renderer/api/git.api.ts` | Renderer API slice for git operations |
| `tests/unit/services/git.test.ts` | Unit tests for git status parsing |

### Modified Files

| File | Changes |
|------|---------|
| `src/main/ipc/index.ts` | Add `export { registerGitHandlers } from './git'` |
| `src/main/bootstrap/extended.ts` | Import and call `registerGitHandlers()` |
| `src/preload/index.ts` | Import `gitRpc`, add `...bindRpc(gitRpc)` to HaloAPI, add type to interface |
| `src/renderer/api/index.ts` | Import and spread `gitApi` |
| `src/renderer/types/index.ts` | Add `gitChangesHeight?: number` to `LayoutConfig` |
| `src/renderer/components/artifact/ArtifactTree.tsx` | Add Globe/FolderOpen buttons to toolbar; accept `onOpenBrowser`/`onOpenFolder` props |
| `src/renderer/components/artifact/ArtifactRail.tsx` | Pass handlers to ArtifactTree; remove footer; mount GitChangesPanel |

---

### Task 1: Git RPC Contract

**Files:**
- Create: `src/shared/rpc/contracts/git.contract.ts`

- [ ] **Step 1: Create the contract file**

```typescript
// src/shared/rpc/contracts/git.contract.ts
import { rpcMethod } from '../define'

export interface GitFileStatus {
  path: string
  relativePath: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
}

export interface GitStatusResult {
  branch: string | null
  files: GitFileStatus[]
}

export const gitRpc = {
  gitStatus: rpcMethod<[spaceId: string], GitStatusResult>('git:status'),
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/shared/rpc/contracts/git.contract.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/rpc/contracts/git.contract.ts
git commit -m "feat: add git status RPC contract"
```

---

### Task 2: Git Service

**Files:**
- Create: `src/main/services/git.service.ts`
- Create: `tests/unit/services/git.test.ts`

- [ ] **Step 1: Write the parsing unit test**

```typescript
// tests/unit/services/git.test.ts
import { describe, it, expect } from 'vitest'
import { parseGitStatusPorcelain } from '../../../src/main/services/git.service'

describe('Git Service', () => {
  describe('parseGitStatusPorcelain', () => {
    it('parses modified files', () => {
      const output = '## main\n M src/foo.ts\n M src/bar.ts\n'
      const result = parseGitStatusPorcelain(output)
      expect(result.branch).toBe('main')
      expect(result.files).toHaveLength(2)
      expect(result.files[0]).toEqual({ path: 'src/foo.ts', relativePath: 'src/foo.ts', status: 'modified' })
      expect(result.files[1]).toEqual({ path: 'src/bar.ts', relativePath: 'src/bar.ts', status: 'modified' })
    })

    it('parses added files', () => {
      const output = '## main\nA  src/new.ts\n'
      const result = parseGitStatusPorcelain(output)
      expect(result.files[0].status).toBe('added')
    })

    it('parses deleted files', () => {
      const output = '## main\n D src/old.ts\n'
      const result = parseGitStatusPorcelain(output)
      expect(result.files[0].status).toBe('deleted')
    })

    it('parses untracked files', () => {
      const output = '## main\n?? src/untracked.ts\n'
      const result = parseGitStatusPorcelain(output)
      expect(result.files[0]).toEqual({ path: 'src/untracked.ts', relativePath: 'src/untracked.ts', status: 'untracked' })
    })

    it('parses renamed files', () => {
      const output = '## main\nR  src/old.ts -> src/new.ts\n'
      const result = parseGitStatusPorcelain(output)
      expect(result.files[0].status).toBe('renamed')
      expect(result.files[0].relativePath).toBe('src/new.ts')
    })

    it('returns empty for no changes', () => {
      const output = '## main\n'
      const result = parseGitStatusPorcelain(output)
      expect(result.branch).toBe('main')
      expect(result.files).toHaveLength(0)
    })

    it('handles branch with tracking info', () => {
      const output = '## main...origin/main\n M src/foo.ts\n'
      const result = parseGitStatusPorcelain(output)
      expect(result.branch).toBe('main')
    })

    it('handles empty input', () => {
      const result = parseGitStatusPorcelain('')
      expect(result.branch).toBeNull()
      expect(result.files).toHaveLength(0)
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/services/git.test.ts`
Expected: FAIL — `parseGitStatusPorcelain` not found

- [ ] **Step 3: Implement the git service**

```typescript
// src/main/services/git.service.ts
import { exec } from 'child_process'
import { join } from 'path'
import { promisify } from 'util'
import type { GitFileStatus, GitStatusResult } from '../../shared/rpc/contracts/git.contract'
import { getSpace } from './space.service'

const execAsync = promisify(exec)

/**
 * Parse `git status --porcelain -b` output into structured data.
 * Exported for unit testing.
 */
export function parseGitStatusPorcelain(output: string): GitStatusResult {
  const lines = output.split('\n').filter(line => line.length > 0)
  if (lines.length === 0) return { branch: null, files: [] }

  // First line: branch info (## main...origin/main [ahead 1])
  const branchLine = lines[0]
  const branchMatch = branchLine.match(/^## (.+?)(?:\.\.\.|$)/)
  const branch = branchMatch ? branchMatch[1] : null

  const files: GitFileStatus[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.length < 4) continue

    const indexStatus = line[0]
    const workTreeStatus = line[1]
    const filePath = line.substring(3)

    // Renamed: "R  old.ts -> new.ts"
    if (indexStatus === 'R' || indexStatus === 'C') {
      const arrowIndex = filePath.indexOf(' -> ')
      if (arrowIndex !== -1) {
        const newPath = filePath.substring(arrowIndex + 4)
        files.push({
          path: newPath,
          relativePath: newPath,
          status: indexStatus === 'R' ? 'renamed' : 'added',
        })
        continue
      }
    }

    // Untracked: "?? file"
    if (indexStatus === '?' && workTreeStatus === '?') {
      files.push({ path: filePath, relativePath: filePath, status: 'untracked' })
      continue
    }

    // Deleted: " D file" or "D  file"
    if (indexStatus === 'D' || workTreeStatus === 'D') {
      files.push({ path: filePath, relativePath: filePath, status: 'deleted' })
      continue
    }

    // Added: "A  file"
    if (indexStatus === 'A') {
      files.push({ path: filePath, relativePath: filePath, status: 'added' })
      continue
    }

    // Modified: " M file" or "M  file" or "MM file"
    if (indexStatus === 'M' || workTreeStatus === 'M') {
      files.push({ path: filePath, relativePath: filePath, status: 'modified' })
      continue
    }
  }

  return { branch, files }
}

/**
 * Get git status for a space directory.
 * Returns empty result for non-git directories (no error thrown).
 */
export async function getGitStatus(spacePath: string): Promise<GitStatusResult> {
  try {
    const { stdout } = await execAsync('git status --porcelain -b', {
      cwd: spacePath,
      timeout: 10000,
      windowsHide: true,
    })
    return parseGitStatusPorcelain(stdout)
  } catch {
    // Not a git repo, git not installed, or other error
    return { branch: null, files: [] }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/services/git.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/git.service.ts tests/unit/services/git.test.ts
git commit -m "feat: add git status service with porcelain parser"
```

---

### Task 3: Git IPC Handler

**Files:**
- Create: `src/main/ipc/git.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/bootstrap/extended.ts`

- [ ] **Step 1: Create the IPC handler**

```typescript
// src/main/ipc/git.ts
import { registerRpcHandlers } from './rpc'
import { gitRpc } from '../../shared/rpc/contracts/git.contract'
import { getGitStatus } from '../services/git.service'
import { getSpace } from '../services/space.service'

export function registerGitHandlers(): void {
  registerRpcHandlers(gitRpc, {
    gitStatus: async (spaceId: string) => {
      const space = getSpace(spaceId)
      if (!space) return { branch: null, files: [] }
      const spacePath = space.workingDir || space.path
      return getGitStatus(spacePath)
    },
  }, 'Git')
}
```

- [ ] **Step 2: Add export to IPC index**

In `src/main/ipc/index.ts`, add at the end of the exports:

```typescript
export { registerGitHandlers } from './git'
```

- [ ] **Step 3: Register in bootstrap**

In `src/main/bootstrap/extended.ts`, add the import and call:

Import (add near other IPC imports around line 38):
```typescript
import { registerGitHandlers } from '../ipc/git'
```

Call (add after `registerGitBashHandlers()` around line 275):
```typescript
// Git: Status queries for the file tree git changes panel
registerGitHandlers()
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (or only pre-existing errors)

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/git.ts src/main/ipc/index.ts src/main/bootstrap/extended.ts
git commit -m "feat: register git status IPC handler"
```

---

### Task 4: Transport Sync (Preload + Renderer API)

**Files:**
- Modify: `src/preload/index.ts`
- Create: `src/renderer/api/git.api.ts`
- Modify: `src/renderer/api/index.ts`

- [ ] **Step 1: Update preload**

In `src/preload/index.ts`:

Add import (near other contract imports around line 28):
```typescript
import { gitRpc } from '../shared/rpc/contracts/git.contract'
```

Add to HaloAPI interface (add after git-bash methods, find the section with `installGitBash`):
```typescript
gitStatus: (spaceId: string) => Promise<{ success: boolean; data?: { branch: string | null; files: Array<{ path: string; relativePath: string; status: string }> }; error?: string }>
```

Add to the api object composition (after `...bindRpc(gitBashRpc)` around line 704):
```typescript
...bindRpc(gitRpc),
```

- [ ] **Step 2: Create renderer API slice**

```typescript
// src/renderer/api/git.api.ts
import { isElectron } from './_shared'

export const gitApi = {
  gitStatus: async (spaceId: string) => {
    if (isElectron()) {
      return window.halo.gitStatus(spaceId)
    }
    // Remote mode: not supported for git status (local-only feature)
    return { success: true, data: { branch: null, files: [] } }
  },
}
```

- [ ] **Step 3: Add to API barrel**

In `src/renderer/api/index.ts`, add import and spread:

Import (add after `backupApi` import):
```typescript
import { gitApi } from './git.api'
```

Spread (add after `...backupApi`):
```typescript
...gitApi,
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/renderer/api/git.api.ts src/renderer/api/index.ts
git commit -m "feat: sync git status transport (preload + renderer API)"
```

---

### Task 5: LayoutConfig Type Extension

**Files:**
- Modify: `src/renderer/types/index.ts`

- [ ] **Step 1: Add gitChangesHeight to LayoutConfig**

In `src/renderer/types/index.ts`, find the `LayoutConfig` interface (around line 247) and add:

```typescript
export interface LayoutConfig {
  sidebarOpen?: boolean;
  sidebarWidth?: number;
  artifactRailWidth?: number;
  taskPlanHeight?: number;
  gitChangesHeight?: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/types/index.ts
git commit -m "feat: add gitChangesHeight to LayoutConfig type"
```

---

### Task 6: useGitStatus Hook

**Files:**
- Create: `src/renderer/hooks/useGitStatus.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/renderer/hooks/useGitStatus.ts
import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '../api'
import type { GitFileStatus } from '../../shared/rpc/contracts/git.contract'
import { useChatStore } from '../stores/chat.store'

interface UseGitStatusResult {
  files: GitFileStatus[]
  branch: string | null
  refresh: () => void
  isEmpty: boolean
}

export function useGitStatus(spaceId: string): UseGitStatusResult {
  const [files, setFiles] = useState<GitFileStatus[]>([])
  const [branch, setBranch] = useState<string | null>(null)
  const prevIsGeneratingRef = useRef(false)

  const fetchStatus = useCallback(async () => {
    try {
      const result = await api.gitStatus(spaceId)
      if (result.success && result.data) {
        setFiles(result.data.files)
        setBranch(result.data.branch)
      }
    } catch (err) {
      console.error('[useGitStatus] Failed to fetch git status:', err)
    }
  }, [spaceId])

  // Fetch on mount
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Auto-refresh when AI response completes (isGenerating transitions true → false)
  useEffect(() => {
    const unsub = useChatStore.subscribe((state) => {
      const spaceState = state.currentSpaceId
        ? state.spaceStates.get(state.currentSpaceId)
        : null
      const session = spaceState?.currentConversationId
        ? state.sessions.get(spaceState.currentConversationId)
        : undefined
      const isGenerating = session?.isGenerating ?? false

      if (prevIsGeneratingRef.current && !isGenerating) {
        // AI response just completed
        fetchStatus()
      }
      prevIsGeneratingRef.current = isGenerating
    })

    return unsub
  }, [fetchStatus])

  return {
    files,
    branch,
    refresh: fetchStatus,
    isEmpty: files.length === 0,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/renderer/hooks/useGitStatus.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/hooks/useGitStatus.ts
git commit -m "feat: add useGitStatus hook with auto-refresh on AI completion"
```

---

### Task 7: GitChangesPanel Component

**Files:**
- Create: `src/renderer/components/artifact/GitChangesPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/renderer/components/artifact/GitChangesPanel.tsx
import { useState, useRef, useCallback, useEffect } from 'react'
import { GitBranch, ChevronDown } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useGitStatus } from '../../hooks/useGitStatus'
import { useAppStore } from '../../stores/app.store'
import { api } from '../../api'
import type { GitFileStatus } from '../../../shared/rpc/contracts/git.contract'

const MIN_HEIGHT = 120
const MAX_HEIGHT = 600
const DEFAULT_HEIGHT = 240

const STATUS_LABELS: Record<GitFileStatus['status'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: '?',
}

const STATUS_COLORS: Record<GitFileStatus['status'], string> = {
  modified: 'text-yellow-500',
  added: 'text-green-500',
  deleted: 'text-red-500',
  renamed: 'text-blue-500',
  untracked: 'text-muted-foreground',
}

interface GitChangesPanelProps {
  spaceId: string
  onFileClick?: (file: GitFileStatus) => void
}

export function GitChangesPanel({ spaceId, onFileClick }: GitChangesPanelProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(true)
  const { files, isEmpty } = useGitStatus(spaceId)

  // Resizable height — initialized from persisted config
  const layoutConfig = useAppStore(state => state.config?.layout)
  const [height, setHeight] = useState(layoutConfig?.gitChangesHeight ?? DEFAULT_HEIGHT)
  const [isDragging, setIsDragging] = useState(false)
  const heightRef = useRef(height)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)

  // Sync persisted height when config arrives asynchronously
  useEffect(() => {
    if (layoutConfig?.gitChangesHeight !== undefined && !isDragging) {
      const clamped = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, layoutConfig.gitChangesHeight))
      setHeight(clamped)
      heightRef.current = clamped
    }
  }, [layoutConfig?.gitChangesHeight, isDragging])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    startYRef.current = e.clientY
    startHeightRef.current = heightRef.current
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startYRef.current - e.clientY
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeightRef.current + delta))
      setHeight(newHeight)
      heightRef.current = newHeight
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      const currentConfig = useAppStore.getState().config
      if (currentConfig) {
        useAppStore.getState().updateConfig({ layout: { ...currentConfig.layout, gitChangesHeight: heightRef.current } })
      }
      api.setConfig({ layout: { gitChangesHeight: heightRef.current } }).catch(err =>
        console.error('[GitChangesPanel] Failed to persist height:', err)
      )
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  return (
    <div
      className={`border-t border-border flex-shrink-0 flex flex-col ${isDragging ? '' : 'transition-[height] duration-100'}`}
      style={{ height: isExpanded ? height : 'auto' }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`h-1.5 -mt-px cursor-row-resize hover:bg-primary/50 transition-colors shrink-0 ${
          isDragging ? 'bg-primary/50' : ''
        }`}
        title={t('Drag to resize')}
      />

      {/* Title row */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors shrink-0"
      >
        <span className="text-muted-foreground">
          <GitBranch size={14} />
        </span>
        <span className="text-sm font-medium text-muted-foreground flex-1 text-left">
          {t('Changed files')} ({files.length})
        </span>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`}
        />
      </button>

      {/* Content area */}
      {isExpanded && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isEmpty ? (
            <div className="px-3 pb-3">
              <p className="text-xs text-muted-foreground/60">
                {t('No uncommitted changes')}
              </p>
            </div>
          ) : (
            <div className="px-2 pb-2">
              {files.map((file, index) => (
                <button
                  key={`${file.relativePath}-${index}`}
                  onClick={() => onFileClick?.(file)}
                  className="w-full flex items-center gap-2 px-1 py-0.5 hover:bg-secondary/60 rounded text-left transition-colors"
                >
                  <span className={`text-xs font-mono w-4 text-center ${STATUS_COLORS[file.status]}`}>
                    {STATUS_LABELS[file.status]}
                  </span>
                  <span className="text-xs text-foreground truncate" title={file.relativePath}>
                    {file.relativePath}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/artifact/GitChangesPanel.tsx
git commit -m "feat: add GitChangesPanel component with drag-to-resize"
```

---

### Task 8: Button Migration

**Files:**
- Modify: `src/renderer/components/artifact/ArtifactTree.tsx`
- Modify: `src/renderer/components/artifact/ArtifactRail.tsx`

- [ ] **Step 1: Update ArtifactTree props and toolbar**

In `src/renderer/components/artifact/ArtifactTree.tsx`:

Update the props interface (around line 57):
```typescript
interface ArtifactTreeProps {
  spaceId: string
  onOpenBrowser?: () => void
  onOpenFolder?: () => void
}
```

Update the function signature (around line 156):
```typescript
export function ArtifactTree({ spaceId, onOpenBrowser, onOpenFolder }: ArtifactTreeProps) {
```

Add Globe and FolderOpen to the imports from lucide-react (find the existing lucide-react import):
```typescript
import { FilePlus, FolderPlus, RefreshCw, Globe, FolderOpen } from 'lucide-react'
```

Update the toolbar buttons section (around line 649-665). Replace the existing `<div className="flex gap-1">` with:
```tsx
<div className="flex gap-1">
  {onOpenBrowser && (
    <button
      onClick={onOpenBrowser}
      className="p-1 hover:bg-secondary/60 rounded transition-colors"
      title={t('Open browser')}
    >
      <Globe className="w-3.5 h-3.5 text-blue-500" />
    </button>
  )}
  {onOpenFolder && (
    <button
      onClick={onOpenFolder}
      className="p-1 hover:bg-secondary/60 rounded transition-colors"
      title={t('Open folder')}
    >
      <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
    </button>
  )}
  <button onClick={handleNewFile} className="p-1 hover:bg-secondary/60 rounded transition-colors" title={t('New File')}>
    <FilePlus className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
  </button>
  <button onClick={handleNewFolder} className="p-1 hover:bg-secondary/60 rounded transition-colors" title={t('New Folder')}>
    <FolderPlus className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
  </button>
  <button onClick={() => { api.reconcileArtifacts(spaceId) }} className="p-1 hover:bg-secondary/60 rounded transition-colors" title={t('Refresh file tree')}>
    <RefreshCw className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
  </button>
</div>
```

- [ ] **Step 2: Update ArtifactRail to pass handlers and remove footer**

In `src/renderer/components/artifact/ArtifactRail.tsx`:

Find the `renderContent` function (around line 401) and update the `<ArtifactTree>` usage:
```tsx
<ArtifactTree
  spaceId={spaceId}
  onOpenBrowser={handleOpenBrowser}
  onOpenFolder={handleOpenFolder}
/>
```

Remove the `renderFooter()` function definition entirely (lines ~451-486).

Remove the `{renderFooter()}` call from the expanded content area (around line 608).

Remove the collapsed state browser/folder buttons (lines ~611-639). The collapsed state should only show the chevron toggle in the header.

Remove `Globe` and `FolderOpen` from the lucide-react imports if they are no longer used elsewhere in this file. Keep them only if used in the collapsed state icons that remain.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/artifact/ArtifactTree.tsx src/renderer/components/artifact/ArtifactRail.tsx
git commit -m "feat: move open browser/folder buttons to file tree toolbar"
```

---

### Task 9: Layout Integration — Mount GitChangesPanel

**Files:**
- Modify: `src/renderer/components/artifact/ArtifactRail.tsx`

- [ ] **Step 1: Import GitChangesPanel**

In `src/renderer/components/artifact/ArtifactRail.tsx`, add import:
```typescript
import { GitChangesPanel } from './GitChangesPanel'
```

- [ ] **Step 2: Mount GitChangesPanel in the layout**

Find the expanded content area (around line 606-609). The current structure is:
```tsx
<div className={`flex-1 flex flex-col overflow-hidden${isExpanded ? '' : ' hidden'}`}>
  {renderContent()}
  {renderFooter()}
</div>
```

Update to:
```tsx
<div className={`flex-1 flex flex-col overflow-hidden${isExpanded ? '' : ' hidden'}`}>
  {renderContent()}
  <GitChangesPanel spaceId={spaceId} />
</div>
```

(`renderFooter()` was removed in Task 8.)

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run all tests**

Run: `npx vitest run tests/unit/services/git.test.ts`
Expected: PASS

- [ ] **Step 5: Run i18n extraction**

Run: `npm run i18n`
Expected: New keys `"Changed files"`, `"No uncommitted changes"`, `"Open browser"`, `"Open folder"` extracted to all locale files

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/artifact/ArtifactRail.tsx
npm run i18n
git add src/renderer/i18n/
git commit -m "feat: mount GitChangesPanel in left sidebar layout"
```

---

## Verification Checklist

After all tasks are complete, verify:

| Scenario | Expected |
|----------|----------|
| Header toolbar shows 5 buttons | Globe, FolderOpen, FilePlus, FolderPlus, RefreshCw — all icon-only |
| Open Browser button click | Opens browser homepage |
| Open Folder button click | Opens space folder in OS file manager |
| Footer area removed | No footer in expanded/collapsed/mobile modes |
| Git repo with changes | Panel shows file list with status badges and count |
| Git repo, no changes | Panel shows empty hint |
| Non-git directory | Panel shows empty state (no error) |
| AI response completes | Git status auto-refreshes |
| Click changed file in panel | onFileClick callback fires |
| Drag panel height | Resizes smoothly, persists across sessions |
| Collapse/expand panel | Toggle works |
| Mobile < 640px | Panel fills sidebar width |
