# Knowledge Base Sidebar Height Fix & Detail View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 固定侧栏知识库面板高度（最多显示 3 条文档），新增"查看全部"入口在 ContentCanvas 打开知识库详情 tab。

**Architecture:** 扩展 `ContentType` 联合类型新增 `'knowledge-base'`，在 `canvasLifecycle` 新增带去重的 `openKnowledgeBase` 方法，经 `canvas.store` 与 `useCanvasLifecycle` 代理层暴露；新建 `KnowledgeBaseViewer` 作为详情页 viewer，在 `ContentCanvas` 路由；`KnowledgeBasePanel` 改为 `slice(0, 3)` + 条件渲染"查看全部"按钮。

**Tech Stack:** React + TypeScript + Zustand + Vitest（源码读取式测试，与现有 `desktop-sidebar-position-swap.test.ts` 同模式）

**前置要求：** 实现前必须先读 `halo-dev` skill（项目 CLAUDE.md 强制要求），遵循其中的架构约定、响应式设计与 i18n 规则（`t('English')`，禁止硬编码文案）。

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/renderer/services/canvas-lifecycle.ts` | tab 生命周期管理 | Modify: 加 `'knowledge-base'` 类型 + `openKnowledgeBase` 方法 |
| `src/renderer/stores/canvas.store.ts | Zustand 代理层 | Modify: 加 `openKnowledgeBase` 接口与实现 |
| `src/renderer/hooks/useCanvasLifecycle.ts` | React hook 桥接 | Modify: 加 `openKnowledgeBase` 回调 |
| `src/renderer/components/canvas/viewers/KnowledgeBaseViewer.tsx` | 知识库详情页 viewer | Create |
| `src/renderer/components/canvas/ContentCanvas.tsx` | tab 内容路由 | Modify: switch 加 `knowledge-base` case |
| `src/renderer/components/knowledge/KnowledgeBasePanel.tsx` | 侧栏面板 | Modify: slice(0,3) + "查看全部"按钮 |
| `tests/unit/renderer/knowledge-base-sidebar.test.ts` | 结构与逻辑测试 | Create |

---

### Task 1: 扩展 ContentType 与 canvasLifecycle.openKnowledgeBase

**Files:**
- Modify: `src/renderer/services/canvas-lifecycle.ts:37-47`（ContentType）
- Modify: `src/renderer/services/canvas-lifecycle.ts`（新增 openKnowledgeBase 方法，放在 openContent 方法之后约 714 行处）
- Test: `tests/unit/renderer/knowledge-base-sidebar.test.ts`

- [ ] **Step 1: 写失败测试 — ContentType 包含 knowledge-base**

创建 `tests/unit/renderer/knowledge-base-sidebar.test.ts`：

```typescript
import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../../..')
const readSource = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf-8')

describe('knowledge-base sidebar height fix', () => {
  it('ContentType includes knowledge-base type', () => {
    const source = readSource('src/renderer/services/canvas-lifecycle.ts')
    expect(source).toContain("'knowledge-base'")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:unit -- tests/unit/renderer/knowledge-base-sidebar.test.ts`
Expected: FAIL — `'knowledge-base'` not found in source

- [ ] **Step 3: 在 ContentType 联合类型加入 'knowledge-base'**

修改 `src/renderer/services/canvas-lifecycle.ts:37-47`，在 `'terminal'` 后新增一行：

```typescript
export type ContentType =
  | 'code'
  | 'markdown'
  | 'html'
  | 'image'
  | 'pdf'
  | 'text'
  | 'json'
  | 'csv'
  | 'browser'
  | 'terminal'
  | 'knowledge-base'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:unit -- tests/unit/renderer/knowledge-base-sidebar.test.ts`
Expected: PASS

- [ ] **Step 5: 写失败测试 — openKnowledgeBase 方法存在且带去重**

在 `tests/unit/renderer/knowledge-base-sidebar.test.ts` 的 describe 块内追加：

```typescript
  it('canvasLifecycle has openKnowledgeBase method with dedup logic', () => {
    const source = readSource('src/renderer/services/canvas-lifecycle.ts')
    expect(source).toContain('openKnowledgeBase(')
    // Dedup: check for existing knowledge-base tab before creating new one
    expect(source).toMatch(/openKnowledgeBase[\s\S]*?type === 'knowledge-base'[\s\S]*?switchTab/)
  })
```

- [ ] **Step 6: 运行测试确认失败**

Run: `npm run test:unit -- tests/unit/renderer/knowledge-base-sidebar.test.ts`
Expected: FAIL — `openKnowledgeBase(` not found

- [ ] **Step 7: 在 canvasLifecycle 类中实现 openKnowledgeBase**

在 `src/renderer/services/canvas-lifecycle.ts` 的 `openContent` 方法之后（约 714 行 `return tabId` 的闭合花括号后）插入：

```typescript
  /**
   * Open knowledge base detail tab (deduplicated by type).
   * If a knowledge-base tab already exists, switch to it instead of creating a new one.
   */
  async openKnowledgeBase(): Promise<string> {
    // Dedup: reuse existing knowledge-base tab
    for (const [tabId, tab] of this.tabs) {
      if (tab.type === 'knowledge-base') {
        await this.switchTab(tabId)
        return tabId
      }
    }

    const tabId = generateTabId()
    const tab: TabState = {
      id: tabId,
      type: 'knowledge-base',
      title: 'Knowledge Base',
      isDirty: false,
      isLoading: false,
    }

    this.tabs.set(tabId, tab)
    this.setOpen(true)
    this.notifyTabsChange()

    await this.switchTab(tabId)

    return tabId
  }
```

注意：`title` 用英文 `'Knowledge Base'`，因为 canvas tab 标题由内部渲染层处理 i18n（参照其他 tab 的 title 也是英文）。若后续发现 tab 标题需要 i18n，再统一调整。

- [ ] **Step 8: 运行测试确认通过**

Run: `npm run test:unit -- tests/unit/renderer/knowledge-base-sidebar.test.ts`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add src/renderer/services/canvas-lifecycle.ts tests/unit/renderer/knowledge-base-sidebar.test.ts
git commit -m "feat: 扩展 ContentType 支持 knowledge-base 类型并新增 openKnowledgeBase 方法"
```

---

### Task 2: 在 canvas.store 与 useCanvasLifecycle 暴露 openKnowledgeBase

**Files:**
- Modify: `src/renderer/stores/canvas.store.ts:32-79`（接口）与 `:101-241`（实现）
- Modify: `src/renderer/hooks/useCanvasLifecycle.ts:67-71`（openContent 附近）
- Test: `tests/unit/renderer/knowledge-base-sidebar.test.ts`

- [ ] **Step 1: 写失败测试 — store 与 hook 暴露 openKnowledgeBase**

在 `tests/unit/renderer/knowledge-base-sidebar.test.ts` 的 describe 块内追加：

```typescript
  it('canvas store interface declares openKnowledgeBase', () => {
    const source = readSource('src/renderer/stores/canvas.store.ts')
    expect(source).toContain('openKnowledgeBase: () => Promise<void>')
  })

  it('canvas store implementation delegates openKnowledgeBase to canvasLifecycle', () => {
    const source = readSource('src/renderer/stores/canvas.store.ts')
    expect(source).toContain('openKnowledgeBase: async () => {')
    expect(source).toContain('await canvasLifecycle.openKnowledgeBase()')
  })

  it('useCanvasLifecycle hook exposes openKnowledgeBase', () => {
    const source = readSource('src/renderer/hooks/useCanvasLifecycle.ts')
    expect(source).toContain('const openKnowledgeBase = useCallback(')
    expect(source).toContain('canvasLifecycle.openKnowledgeBase()')
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:unit -- tests/unit/renderer/knowledge-base-sidebar.test.ts`
Expected: FAIL — 3 个新断言失败

- [ ] **Step 3: 在 canvas.store.ts 接口新增 openKnowledgeBase**

修改 `src/renderer/stores/canvas.store.ts`，在 `openContent` 接口声明之后（约第 50 行）加一行：

```typescript
  openContent: (content: string, title: string, type: ContentType, language?: string) => void
  openKnowledgeBase: () => Promise<void>
```

- [ ] **Step 4: 在 canvas.store.ts 实现新增 openKnowledgeBase**

在 `src/renderer/stores/canvas.store.ts` 的 `openContent` 实现（约第 137-139 行）之后加：

```typescript
    openKnowledgeBase: async () => {
      await canvasLifecycle.openKnowledgeBase()
    },
```

- [ ] **Step 5: 在 useCanvasLifecycle hook 新增 openKnowledgeBase**

修改 `src/renderer/hooks/useCanvasLifecycle.ts`，在 `openContent` 的 useCallback（约第 67-71 行）之后加：

```typescript
  const openKnowledgeBase = useCallback(
    () => canvasLifecycle.openKnowledgeBase(),
    []
  )
```

然后在 return 对象的 `openContent,`（约第 171 行）之后加 `openKnowledgeBase,`：

```typescript
    openContent,
    openKnowledgeBase,
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npm run test:unit -- tests/unit/renderer/knowledge-base-sidebar.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/renderer/stores/canvas.store.ts src/renderer/hooks/useCanvasLifecycle.ts tests/unit/renderer/knowledge-base-sidebar.test.ts
git commit -m "feat: 在 canvas store 与 hook 暴露 openKnowledgeBase 方法"
```

---

### Task 3: 创建 KnowledgeBaseViewer 组件

**Files:**
- Create: `src/renderer/components/canvas/viewers/KnowledgeBaseViewer.tsx`
- Test: `tests/unit/renderer/knowledge-base-sidebar.test.ts`

- [ ] **Step 1: 写失败测试 — KnowledgeBaseViewer 文件存在且结构正确**

在 `tests/unit/renderer/knowledge-base-sidebar.test.ts` 的 describe 块内追加：

```typescript
  it('KnowledgeBaseViewer component file exists and exports component', () => {
    const source = readSource('src/renderer/components/canvas/viewers/KnowledgeBaseViewer.tsx')
    expect(source).toContain('export function KnowledgeBaseViewer')
    expect(source).toContain('useKnowledgeStore')
    expect(source).toContain('useTranslation')
  })

  it('KnowledgeBaseViewer renders full document list without slice limit', () => {
    const source = readSource('src/renderer/components/canvas/viewers/KnowledgeBaseViewer.tsx')
    // Full list - should NOT contain slice(0, 3)
    expect(source).not.toContain('slice(0, 3)')
    // Should render all documents
    expect(source).toMatch(/documents\.map/)
  })

  it('KnowledgeBaseViewer supports upload and delete actions', () => {
    const source = readSource('src/renderer/components/canvas/viewers/KnowledgeBaseViewer.tsx')
    expect(source).toContain('handleUpload')
    expect(source).toContain('handleDelete')
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:unit -- tests/unit/renderer/knowledge-base-sidebar.test.ts`
Expected: FAIL — 文件不存在

- [ ] **Step 3: 创建 KnowledgeBaseViewer 组件**

创建 `src/renderer/components/canvas/viewers/KnowledgeBaseViewer.tsx`：

```tsx
/**
 * KnowledgeBaseViewer - Full knowledge base management view for ContentCanvas.
 *
 * Renders the complete document list with upload, search, and delete actions.
 * Clicking a document opens its preview in a separate canvas tab.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { BookOpen, Search, Trash2, Upload, X, FileText, AlertCircle } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import { useKnowledgeStore } from '../../../stores/knowledge.store'
import { useSpaceStore } from '../../../stores/space.store'
import { useCanvasStore } from '../../../stores/canvas.store'
import { isElectron } from '../../../api/transport'
import type { CanvasTab } from '../../../stores/canvas.store'

interface KnowledgeBaseViewerProps {
  tab: CanvasTab
}

export function KnowledgeBaseViewer({ tab: _tab }: KnowledgeBaseViewerProps) {
  const { t } = useTranslation()
  const currentSpace = useSpaceStore(state => state.currentSpace)
  const openFile = useCanvasStore(state => state.openFile)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    documents,
    searchResults,
    isSearching,
    isLoading,
    isUploading,
    error,
    loadDocuments,
    searchDocuments,
    clearSearch,
    deleteDocument,
    uploadDocuments,
  } = useKnowledgeStore()

  useEffect(() => {
    if (currentSpace?.id) {
      loadDocuments(currentSpace.id)
    }
  }, [currentSpace?.id, loadDocuments])

  const handleUpload = useCallback(() => {
    if (!currentSpace?.id) return
    if (isElectron()) {
      uploadDocuments(currentSpace.id)
    } else {
      fileInputRef.current?.click()
    }
  }, [currentSpace?.id, uploadDocuments])

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0 || !currentSpace?.id) return

    const files: Array<{ name: string; content: string; type: string }> = []
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      const content = await file.arrayBuffer()
      files.push({
        name: file.name,
        content: btoa(String.fromCharCode(...new Uint8Array(content))),
        type: file.type,
      })
    }

    await uploadDocuments(currentSpace.id, files)
    e.target.value = ''
  }, [currentSpace?.id, uploadDocuments])

  const handleDelete = useCallback(async (sourcePath: string) => {
    if (!currentSpace?.id) return
    await deleteDocument(currentSpace.id, sourcePath)
  }, [currentSpace?.id, deleteDocument])

  const handleSearchToggle = useCallback(() => {
    if (showSearch) {
      setShowSearch(false)
      setSearchQuery('')
      clearSearch()
    } else {
      setShowSearch(true)
    }
  }, [showSearch, clearSearch])

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)
    if (currentSpace?.id && value.trim()) {
      searchDocuments(currentSpace.id, value, 20)
    } else {
      clearSearch()
    }
  }, [currentSpace?.id, searchDocuments, clearSearch])

  const handleDocClick = useCallback((sourcePath: string, fileName: string) => {
    openFile(sourcePath, fileName)
  }, [openFile])

  const displayResults = showSearch && searchQuery.trim() ? searchResults : null

  return (
    <div className="h-full flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.json,.csv,.pdf"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <BookOpen className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium flex-1">{t('Knowledge Base')}</span>
        <button
          onClick={handleUpload}
          disabled={isUploading}
          title={t('Upload documents')}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{isUploading ? t('Uploading...') : t('Upload')}</span>
        </button>
        <button
          onClick={handleSearchToggle}
          title={t('Search documents')}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${showSearch ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
        >
          <Search className="w-3.5 h-3.5" />
        </button>
      </div>

      {showSearch && (
        <div className="px-4 py-2 border-b border-border">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder={t('Search knowledge base...')}
              className="w-full text-sm px-3 py-1.5 pr-8 bg-secondary/50 rounded border border-border focus:outline-none focus:border-primary/50"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); clearSearch() }}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-destructive bg-destructive/5 border-b border-border">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-overlay">
        {isLoading && (
          <div className="flex items-center gap-2 px-4 py-4">
            <div className="w-4 h-4 border border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">{t('Loading...')}</span>
          </div>
        )}

        {displayResults !== null && (
          <div className="px-4 py-2">
            <div className="text-xs text-muted-foreground/60 py-2">
              {t('Search results')}
            </div>
            {displayResults.length > 0 ? (
              <div className="space-y-2">
                {displayResults.map((r, i) => (
                  <div key={`${r.documentId}-${r.chunkIndex}-${i}`} className="px-3 py-2 text-sm rounded border border-border/50 hover:bg-secondary/30">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="truncate flex-1 font-medium">{r.documentName}</span>
                      <span className="text-xs text-muted-foreground/50">{(r.score * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-3">{r.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              !isSearching && searchQuery.trim() && (
                <div className="py-4 text-sm text-muted-foreground/60 text-center">
                  {t('No results found')}
                </div>
              )
            )}
            {isSearching && (
              <div className="flex items-center gap-2 py-4">
                <div className="w-4 h-4 border border-primary/30 border-t-primary rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">{t('Searching...')}</span>
              </div>
            )}
          </div>
        )}

        {displayResults === null && (
          <div className="px-4 py-2">
            {documents.length > 0 ? (
              <div className="space-y-1">
                {documents.map(doc => (
                  <div
                    key={doc.id}
                    className="group flex items-center gap-2 px-3 py-2 text-sm rounded border border-border/30 hover:bg-secondary/30 cursor-pointer"
                    title={doc.sourcePath}
                    onClick={() => handleDocClick(doc.sourcePath, doc.fileName)}
                  >
                    <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="truncate block">{doc.fileName}</span>
                      <span className="text-xs text-muted-foreground/50">
                        {doc.fileType.toUpperCase()} · {doc.chunkCount} {t('chunks')}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(doc.sourcePath) }}
                      title={t('Delete document')}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              !isLoading && (
                <div className="py-8 text-center">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground/60">{t('No documents yet')}</p>
                  <button
                    onClick={handleUpload}
                    className="mt-2 text-sm text-primary hover:underline"
                  >
                    {t('Upload your first document')}
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:unit -- tests/unit/renderer/knowledge-base-sidebar.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/renderer/components/canvas/viewers/KnowledgeBaseViewer.tsx tests/unit/renderer/knowledge-base-sidebar.test.ts
git commit -m "feat: 新增 KnowledgeBaseViewer 知识库详情页组件"
```

---

### Task 4: 在 ContentCanvas 路由 knowledge-base 类型

**Files:**
- Modify: `src/renderer/components/canvas/ContentCanvas.tsx:30-40`（import）与 `:286-299`（switch）
- Test: `tests/unit/renderer/knowledge-base-sidebar.test.ts`

- [ ] **Step 1: 写失败测试 — ContentCanvas 路由 knowledge-base**

在 `tests/unit/renderer/knowledge-base-sidebar.test.ts` 的 describe 块内追加：

```typescript
  it('ContentCanvas imports KnowledgeBaseViewer', () => {
    const source = readSource('src/renderer/components/canvas/ContentCanvas.tsx')
    expect(source).toContain("import { KnowledgeBaseViewer } from './viewers/KnowledgeBaseViewer'")
  })

  it('ContentCanvas switch routes knowledge-base to KnowledgeBaseViewer', () => {
    const source = readSource('src/renderer/components/canvas/ContentCanvas.tsx')
    expect(source).toMatch(/case 'knowledge-base':[\s\S]*?<KnowledgeBaseViewer tab={tab} \/>/)
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:unit -- tests/unit/renderer/knowledge-base-sidebar.test.ts`
Expected: FAIL — 2 个新断言失败

- [ ] **Step 3: 在 ContentCanvas 加 import**

修改 `src/renderer/components/canvas/ContentCanvas.tsx`，在现有 viewer import 区（约第 30-37 行）的 `TextViewer` import 之后加：

```typescript
import { TextViewer } from './viewers/TextViewer'
import { KnowledgeBaseViewer } from './viewers/KnowledgeBaseViewer'
```

- [ ] **Step 4: 在 switch 语句加 knowledge-base case**

修改 `src/renderer/components/canvas/ContentCanvas.tsx` 的 switch（约第 286-299 行），在 `case 'terminal':` 之前加：

```typescript
    case 'knowledge-base':
      return <KnowledgeBaseViewer tab={tab} />

    case 'terminal':
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test:unit -- tests/unit/renderer/knowledge-base-sidebar.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/renderer/components/canvas/ContentCanvas.tsx tests/unit/renderer/knowledge-base-sidebar.test.ts
git commit -m "feat: ContentCanvas 路由 knowledge-base 类型到 KnowledgeBaseViewer"
```

---

### Task 5: KnowledgeBasePanel 限制 3 条并加"查看全部"入口

**Files:**
- Modify: `src/renderer/components/knowledge/KnowledgeBasePanel.tsx:234-256`（文档列表区）与顶部 import
- Test: `tests/unit/renderer/knowledge-base-sidebar.test.ts`

- [ ] **Step 1: 写失败测试 — KnowledgeBasePanel slice 与 View all 按钮**

在 `tests/unit/renderer/knowledge-base-sidebar.test.ts` 的 describe 块内追加：

```typescript
  it('KnowledgeBasePanel slices documents to max 3', () => {
    const source = readSource('src/renderer/components/knowledge/KnowledgeBasePanel.tsx')
    expect(source).toContain('slice(0, 3)')
  })

  it('KnowledgeBasePanel shows View all button when docs exceed 3', () => {
    const source = readSource('src/renderer/components/knowledge/KnowledgeBasePanel.tsx')
    expect(source).toContain("t('View all ({{count}})'")
    expect(source).toContain('documents.length > 3')
  })

  it('KnowledgeBasePanel View all button calls openKnowledgeBase', () => {
    const source = readSource('src/renderer/components/knowledge/KnowledgeBasePanel.tsx')
    expect(source).toContain('openKnowledgeBase')
    expect(source).toContain('useCanvasStore')
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:unit -- tests/unit/renderer/knowledge-base-sidebar.test.ts`
Expected: FAIL — 3 个新断言失败

- [ ] **Step 3: 在 KnowledgeBasePanel 加 useCanvasStore import**

修改 `src/renderer/components/knowledge/KnowledgeBasePanel.tsx`，在现有 import 区（约第 7-13 行）加：

```typescript
import { useCanvasStore } from '../../stores/canvas.store'
```

- [ ] **Step 4: 在组件内取 openKnowledgeBase**

修改 `src/renderer/components/knowledge/KnowledgeBasePanel.tsx`，在 `const fileInputRef = useRef<HTMLInputElement>(null)` 之后（约第 20 行）加：

```typescript
  const openKnowledgeBase = useCanvasStore(state => state.openKnowledgeBase)
```

- [ ] **Step 5: 修改文档列表渲染为 slice(0,3) + View all 按钮**

修改 `src/renderer/components/knowledge/KnowledgeBasePanel.tsx` 的文档列表区（约第 234-256 行），把：

```tsx
          {/* Document list */}
          {displayResults === null && documents.length > 0 && (
            <div className="space-y-0.5">
              {documents.map(doc => (
                <div key={doc.id} className="group flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-secondary/50" title={doc.sourcePath}>
                  <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="truncate block">{doc.fileName}</span>
                    <span className="text-[10px] text-muted-foreground/50">
                      {doc.fileType.toUpperCase()} &middot; {doc.chunkCount} {t('chunks')}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(doc.sourcePath)}
                    title={t('Delete document')}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
```

替换为：

```tsx
          {/* Document list - limited to 3 in sidebar */}
          {displayResults === null && documents.length > 0 && (
            <div className="space-y-0.5">
              {documents.slice(0, 3).map(doc => (
                <div key={doc.id} className="group flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-secondary/50" title={doc.sourcePath}>
                  <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="truncate block">{doc.fileName}</span>
                    <span className="text-[10px] text-muted-foreground/50">
                      {doc.fileType.toUpperCase()} &middot; {doc.chunkCount} {t('chunks')}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(doc.sourcePath)}
                    title={t('Delete document')}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {documents.length > 3 && (
                <button
                  onClick={() => openKnowledgeBase()}
                  className="w-full flex items-center justify-center gap-1 px-2 py-1 text-xs text-primary hover:bg-primary/5 rounded transition-colors"
                >
                  {t('View all ({{count}})', { count: documents.length })}
                </button>
              )}
            </div>
          )}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npm run test:unit -- tests/unit/renderer/knowledge-base-sidebar.test.ts`
Expected: PASS（全部测试）

- [ ] **Step 7: 提交**

```bash
git add src/renderer/components/knowledge/KnowledgeBasePanel.tsx tests/unit/renderer/knowledge-base-sidebar.test.ts
git commit -m "feat: 知识库侧栏面板限制 3 条并新增查看全部入口"
```

---

### Task 6: 运行 i18n 提取与全量测试

**Files:**
- 无代码改动，仅运行检查

- [ ] **Step 1: 运行 i18n 提取脚本**

Run: `npm run i18n`
Expected: 成功提取新增的 `View all ({{count}})` 等 key 到翻译文件

- [ ] **Step 2: 运行全量单元测试**

Run: `npm run test:unit`
Expected: 全部 PASS，无回归

- [ ] **Step 3: 手动验证（开发者执行）**

启动应用，在浅色和深色主题下分别验证：
- 上传 >3 份文档后侧栏面板高度稳定（只显示 3 条 + "查看全部"按钮）
- 点击"查看全部"在 canvas 打开知识库 tab，重复点击不新开
- 详情 tab 内点击文档能打开预览 tab
- 详情 tab 内删除文档后侧栏列表同步更新
- 文档数 ≤3 时不显示"查看全部"按钮

- [ ] **Step 4: 提交 i18n 变更（如有）**

```bash
git add src/renderer/i18n/locales/
git commit -m "chore: 提取知识库侧栏新增的 i18n key"
```

---

## Self-Review 结果

**Spec coverage:**
- 侧栏固定 3 条 → Task 5 ✓
- "查看全部"按钮 → Task 5 ✓
- ContentCanvas tab 类型扩展 → Task 1 ✓
- openKnowledgeBase 去重 → Task 1 ✓
- store/hook 代理层 → Task 2 ✓
- KnowledgeBaseViewer 完整列表 → Task 3 ✓
- ContentCanvas 路由 → Task 4 ✓
- 不动 useKnowledgeStore 数据层 → 全程未涉及 ✓
- i18n → Task 6 ✓

**Placeholder scan:** 无 TBD/TODO，每个 step 都有完整代码。

**Type consistency:** `openKnowledgeBase()` 签名在 Task 1（`canvasLifecycle`）、Task 2（store `() => Promise<void>`、hook `useCallback`）、Task 5（调用处 `openKnowledgeBase()`）一致。`KnowledgeBaseViewer` props `{ tab: CanvasTab }` 与 Task 4 路由 `<KnowledgeBaseViewer tab={tab} />` 一致。
