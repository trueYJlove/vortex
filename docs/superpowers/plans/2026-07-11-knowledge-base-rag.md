# Knowledge Base / RAG — Implementation Plan

> Spec: `docs/superpowers/specs/2026-07-11-knowledge-base-rag-design.md`

## Execution Order

Five sequential tasks. Each task is a verifiable milestone.

---

## Task 1: FTS5 Availability Verification + Database Migration

**Files:**

| Action | Path |
|--------|------|
| Verify | `better-sqlite3` FTS5 support (runtime check) |
| Create | `src/main/platform/memory/knowledge/migrations.ts` |
| Create | `tests/unit/platform/memory/knowledge/migrations.test.ts` |
| Modify | `src/main/platform/memory/index.ts` — register knowledge migrations on init |

**Steps:**

1. **Verify FTS5 availability** — write a temporary test script:
   ```typescript
   const db = new Database(':memory:')
   try {
     db.exec("CREATE VIRTUAL TABLE test USING fts5(content)")
     console.log('FTS5 available')
   } catch (e) {
     console.error('FTS5 NOT available:', e.message)
   }
   ```
   If FTS5 is not available, stop and discuss fallback (LIKE-based search + trigram index).

2. **Create `migrations.ts`:**

   ```typescript
   import type { Migration } from '../../store/types'

   export const knowledgeMigrations: Migration[] = [
     {
       version: 1,
       description: 'Create knowledge_documents and knowledge_chunks tables',
       up(db) {
         db.exec(`
           CREATE TABLE IF NOT EXISTS knowledge_documents (
             id TEXT PRIMARY KEY,
             space_id TEXT NOT NULL,
             source TEXT NOT NULL,
             source_path TEXT NOT NULL,
             file_name TEXT NOT NULL,
             file_type TEXT NOT NULL,
             content_hash TEXT NOT NULL,
             chunk_count INTEGER NOT NULL DEFAULT 0,
             created_at INTEGER NOT NULL,
             updated_at INTEGER NOT NULL,
             UNIQUE(space_id, source_path)
           );

           CREATE INDEX IF NOT EXISTS idx_knowledge_documents_space
             ON knowledge_documents(space_id);

           CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks USING fts5(
             document_id UNINDEXED,
             space_id UNINDEXED,
             chunk_index,
             content,
             tokenize = 'unicode61'
           );
         `)
       },
     },
   ]
   ```

3. **Register migrations in `index.ts`:**

   In `initMemory()` (or a new `initKnowledge()` called after `initStore()`), add:
   ```typescript
   const db = databaseManager.getAppDatabase()
   databaseManager.runMigrations(db, 'knowledge', knowledgeMigrations)
   ```

4. **Migration test:** Verify tables exist, columns match spec, FTS5 virtual table is queryable.

**Verification:**

- `npm run test:unit -- tests/unit/platform/memory/knowledge/migrations.test.ts` — all pass
- App starts without errors
- `vortex.db` contains `knowledge_documents` and `knowledge_chunks` tables

**Risk:** FTS5 not available in the `better-sqlite3` build. Mitigation: verify first, fallback plan ready.

---

## Task 2: Document Parsing + Chunking

**Files:**

| Action | Path |
|--------|------|
| Modify | `package.json` — add `pdf-parse` dependency |
| Create | `src/main/platform/memory/knowledge/chunking.ts` |
| Create | `src/main/platform/memory/knowledge/pdf-parser.ts` |
| Create | `tests/unit/platform/memory/knowledge/chunking.test.ts` |

**Depends on:** Task 1 (database exists, but chunking is pure logic — can be developed in parallel)

**`chunking.ts` exports:**

```typescript
export type DocumentFileType = 'txt' | 'md' | 'json' | 'csv' | 'pdf'

export interface Chunk {
  index: number
  content: string
}

export function parseAndChunk(
  content: string | Buffer,
  fileType: DocumentFileType
): Chunk[]
```

**Parsing rules per type:**

| Type | Parsing | Chunking |
|------|---------|----------|
| `txt` | UTF-8 string | Split by `\n\n` (paragraphs). Chunks < 100 chars merge with next. Chunks > 2000 chars split at nearest `\n` |
| `md` | UTF-8 string | Split by `## ` headings. Each section is a chunk. Fallback to paragraph splitting if no headings |
| `json` | `JSON.parse` | If array: each element is a chunk (JSON.stringify). If object: each top-level value is a chunk. Fallback: whole doc as one chunk |
| `csv` | UTF-8 string | Header row + each data row combined as a chunk. Large rows (>2000 chars) split further |
| `pdf` | `pdf-parse` extracts text | Split by form feed (`\f`, page break). Fallback to paragraph splitting |

**Chunking constraints:**
- Min chunk size: 100 chars (merge with next if smaller)
- Max chunk size: 2000 chars (split at nearest paragraph/line boundary)
- Overlap: 200 chars between adjacent chunks

**`pdf-parser.ts`:**

```typescript
import pdfParse from 'pdf-parse'

export async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    const result = await pdfParse(buffer)
    return result.text
  } catch (err) {
    log.warn('PDF parsing failed:', err)
    return ''  // Index with empty content, mark as parse_error
  }
}
```

**Test cases:**

```
describe('parseAndChunk')
  ✓ txt: single paragraph → one chunk
  ✓ txt: multiple paragraphs → multiple chunks
  ✓ txt: chunk < 100 chars merges with next
  ✓ txt: chunk > 2000 chars splits at newline
  ✓ md: splits by ## headings
  ✓ md: no headings → paragraph fallback
  ✓ json: array → one chunk per element
  ✓ json: object → one chunk per top-level value
  ✓ json: invalid JSON → whole doc as one chunk
  ✓ csv: header + each row as a chunk
  ✓ pdf: (mocked) extracts text and splits by page
  ✓ pdf: (mocked) parse error → empty string
  ✓ overlap: 200 chars between adjacent chunks
```

**Verification:**

- `npm run test:unit -- tests/unit/platform/memory/knowledge/chunking.test.ts` — all pass
- `npm install` succeeds with `pdf-parse` added

---

## Task 3: KnowledgeService + FTS5 Search

**Files:**

| Action | Path |
|--------|------|
| Create | `src/main/platform/memory/knowledge/types.ts` |
| Create | `src/main/platform/memory/knowledge/fts.ts` |
| Create | `src/main/platform/memory/knowledge/index.ts` |
| Create | `tests/unit/platform/memory/knowledge/service.test.ts` |
| Create | `tests/unit/platform/memory/knowledge/fts.test.ts` |
| Modify | `src/main/platform/memory/index.ts` — export KnowledgeService |

**Depends on:** Task 1 (migrations) + Task 2 (chunking)

**`types.ts`:**

```typescript
export type KnowledgeScope = 'space'
export type DocumentFileType = 'txt' | 'md' | 'json' | 'csv' | 'pdf'
export type DocumentSource = 'upload' | 'artifact'

export interface KnowledgeDocument { /* per spec */ }
export interface SearchResult { /* per spec */ }
export interface KnowledgeSearchParams { /* per spec */ }

export interface KnowledgeService {
  indexDocument(params): Promise<KnowledgeDocument>
  removeDocument(spaceId, sourcePath): Promise<void>
  listDocuments(spaceId): Promise<KnowledgeDocument[]>
  search(params: KnowledgeSearchParams): Promise<SearchResult[]>
  indexArtifact(spaceId, artifactPath): Promise<void>
  searchSemantic?(params): Promise<SearchResult[]>  // Phase 2 placeholder
}
```

**`fts.ts`:**

```typescript
export function ftsSearch(
  db: Database.Database,
  spaceId: string,
  query: string,
  topK: number
): SearchResult[]
```

- Sanitize query: escape FTS5 special chars (`"`, `*`, `:`)
- Use `MATCH` with `rank` ordering
- Return `SearchResult[]` with `score` (negated rank for "higher is better")

**`index.ts` — `KnowledgeService` implementation:**

- `indexDocument`:
  1. Compute SHA-256 content hash
  2. Check existing document by `(space_id, source_path)` — if hash matches, skip
  3. Parse + chunk via `chunking.ts`
  4. Transaction: insert `knowledge_documents` + batch insert `knowledge_chunks`
  5. Return `KnowledgeDocument`
- `removeDocument`: Delete from both tables by `(space_id, source_path)`
- `listDocuments`: `SELECT * FROM knowledge_documents WHERE space_id = ?`
- `search`: Delegate to `fts.ts`
- `indexArtifact`: Read file, detect type by extension, call `indexDocument` with `source: 'artifact'`

**Singleton pattern:** Follow existing `MemoryService` pattern — module-level singleton initialized in `initKnowledge()`.

**Test cases:**

```
describe('KnowledgeService')
  ✓ indexDocument: txt file → document + chunks stored
  ✓ indexDocument: pdf file → document + chunks stored
  ✓ indexDocument: same content hash → skip re-indexing
  ✓ indexDocument: updated content → re-index, replace chunks
  ✓ removeDocument: document + chunks removed
  ✓ listDocuments: returns all documents for space
  ✓ listDocuments: empty space → []
  ✓ search: keyword match → returns relevant chunks
  ✓ search: no match → returns []
  ✓ search: topK limit respected
  ✓ search: space isolation — docs in space A not found in space B
  ✓ indexArtifact: file in artifacts/ → indexed with source='artifact'
```

**Verification:**

- `npm run test:unit -- tests/unit/platform/memory/knowledge/` — all pass
- `npx tsc --noEmit` — no type errors

---

## Task 4: Agent Integration (Prompt Injection + MCP Tool)

**Files:**

| Action | Path |
|--------|------|
| Create | `src/main/platform/memory/knowledge/mcp-tool.ts` |
| Modify | `src/main/apps/runtime/execute.ts` — inject knowledge summary into initial message |
| Modify | `src/main/apps/runtime/prompt.ts` — add knowledge summary builder |
| Modify | `src/main/services/agent/send-message.ts` — inject knowledge summary for interactive chat |
| Modify | `src/main/apps/runtime/index.ts` — register knowledge MCP server |

**Depends on:** Task 3 (KnowledgeService)

**`mcp-tool.ts`:**

```typescript
import { tool, createSdkMcpServer } from '../../services/agent/resolved-sdk'
import type { KnowledgeService } from './types'

export function createKnowledgeSearchMcpServer(params: {
  spaceId: string
  knowledgeService: KnowledgeService
}) {
  return createSdkMcpServer({
    tools: [
      tool({
        name: 'knowledge_search',
        description: 'Search the space knowledge base for relevant document fragments.',
        parameters: {
          query: { type: 'string', description: 'Search query — keywords or phrases' },
          topK: { type: 'number', description: 'Max results (default 5)', optional: true },
        },
        async handler({ query, topK }) {
          const results = await params.knowledgeService.search({
            scope: 'space',
            spaceId: params.spaceId,
            query,
            topK: topK ?? 5,
          })
          if (results.length === 0) {
            return { content: [{ type: 'text', text: 'No results found.' }] }
          }
          const text = results.map((r, i) =>
            `[${i + 1}] ${r.documentName} (chunk ${r.chunkIndex}, score ${r.score.toFixed(2)})\n${r.content}\n`
          ).join('\n')
          return { content: [{ type: 'text', text }] }
        },
      }),
    ],
  })
}
```

**`prompt.ts` — knowledge summary builder:**

```typescript
export function buildKnowledgeSummary(documents: KnowledgeDocument[]): string {
  if (documents.length === 0) return ''
  const lines = documents.map(d =>
    `- ${d.fileName} (${d.fileType}, ${d.chunkCount} chunks)`
  )
  return `## Knowledge Base\n\nThis space has a knowledge base with ${documents.length} documents:\n${lines.join('\n')}\n\nUse the \`knowledge_search\` tool to retrieve relevant content when you need to reference these documents.`
}
```

**`execute.ts` changes:**

In `executeRun()` (or `executeWorkflow()` if workflow mode), after building memory snapshot:

```typescript
// NEW: Knowledge summary injection
const knowledgeDocs = await knowledgeService.listDocuments(spaceId)
const knowledgeSummary = buildKnowledgeSummary(knowledgeDocs)
// Append knowledgeSummary to initial message content
```

And in MCP server registration:

```typescript
// NEW: Register knowledge_search MCP server
const knowledgeMcp = createKnowledgeSearchMcpServer({ spaceId, knowledgeService })
// Add to mcpServers array
```

**`send-message.ts` changes (interactive chat):**

Same pattern — inject knowledge summary into system prompt and register MCP server for the chat session.

**No new unit tests** for integration code — verified manually in Task 5.

**Verification:**

- `npx tsc --noEmit` — no type errors
- App starts, `KnowledgeService` initializes in extended phase
- Manual: start a conversation, verify agent receives knowledge summary in prompt (check developer mode logs)

---

## Task 5: IPC + Renderer UI

**Files:**

| Action | Path |
|--------|------|
| Create | `src/main/ipc/knowledge.ts` |
| Modify | `src/preload/index.ts` — add knowledge API methods |
| Modify | `src/renderer/api/index.ts` — add knowledge API adapter |
| Create | `src/renderer/components/knowledge/KnowledgeBasePanel.tsx` |
| Create | `src/renderer/components/knowledge/KnowledgeDocumentList.tsx` |
| Create | `src/renderer/components/knowledge/KnowledgeUploadButton.tsx` |
| Create | `src/renderer/components/knowledge/KnowledgeSearchPreview.tsx` |
| Modify | `src/renderer/pages/SpacePage.tsx` — add Knowledge Base section |
| Create | `src/renderer/stores/knowledge.store.ts` |

**Depends on:** Task 3 (KnowledgeService) + Task 4 (IPC backend exists)

**IPC channels:**

| Channel | Renderer API Method |
|---------|---------------------|
| `knowledge:upload` | `api.knowledge.upload(spaceId, file)` |
| `knowledge:list` | `api.knowledge.list(spaceId)` |
| `knowledge:delete` | `api.knowledge.delete(spaceId, docId)` |
| `knowledge:search` | `api.knowledge.search(spaceId, query)` |
| `knowledge:reindex` | `api.knowledge.reindex(spaceId, docId?)` |
| `knowledge:status` | event: `onKnowledgeStatus(callback)` |

**Sync checklist (per `quick.md`):**

- `src/main/ipc/knowledge.ts` — `ipcMain.handle` for each channel
- `src/preload/index.ts` — typed methods in `halo.knowledge.*`
- `src/renderer/api/index.ts` — `api.knowledge.*` adapter (IPC only — not remote-capable in Phase 1)

**`knowledge.store.ts`:**

```typescript
interface KnowledgeStore {
  documents: KnowledgeDocument[]
  isLoading: boolean
  isIndexing: boolean
  searchResults: SearchResult[]
  loadDocuments: (spaceId: string) => Promise<void>
  uploadDocument: (spaceId: string, file: File) => Promise<void>
  deleteDocument: (spaceId: string, docId: string) => Promise<void>
  search: (spaceId: string, query: string) => Promise<void>
}
```

**UI components:**

- `KnowledgeBasePanel` — Container, renders document list + upload + search preview
- `KnowledgeDocumentList` — Table on desktop, card list on mobile (`< 640px`)
- `KnowledgeUploadButton` — File input, accepts `.txt,.md,.json,.csv,.pdf`, 50MB limit
- `KnowledgeSearchPreview` — Text input + result display, lets user test search queries

**SpacePage integration:**

Add a new section in `SpacePage.tsx` below existing content:

```tsx
<KnowledgeBasePanel spaceId={space.id} />
```

**Styling:**

- Theme tokens only — no hardcoded colors
- Mobile-first: table → card list on `< 640px`
- `t('English text')` for all strings

**New i18n keys:**

- `'Knowledge Base'`, `'Upload document'`, `'Search knowledge base'`
- `'No documents yet'`, `'Indexing...'`, `'Delete document'`
- `'Search results'`, `'No results found'`
- `'Unsupported file type'`, `'File too large'`
- `'{{count}} chunks'`, `'Last indexed {{date}}'`

**Verification:**

- `npx tsc --noEmit` — no type errors
- `npm run i18n` — new keys extracted
- Manual (desktop):
  - Upload a PDF and a Markdown file → appear in document list
  - Add a file to Space artifacts → auto-appears in document list
  - Search preview returns relevant results
  - Start conversation, ask about uploaded document → agent calls `knowledge_search` and uses result
  - Delete a document → removed from list and search results
- Manual (mobile < 640px):
  - Document list renders as card list
  - Upload button works
  - Search preview usable

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| FTS5 not available in `better-sqlite3` | Low | Task 1 verifies first; fallback to LIKE-based search |
| `pdf-parse` dependency issues | Low | Pure JS library, no native deps; verify in Task 2 |
| Artifact auto-index performance on large spaces | Medium | Debounce file watcher events (500ms); hash-based skip |
| Agent does not call `knowledge_search` | Medium | Summary injection tells agent about available knowledge; prompt engineering |
| MCP tool registration conflict | Low | Follow existing `halo-memory` / `halo-report` registration pattern |
| IPC sync missing file | Medium | Use `quick.md` checklist; verify each file in Task 5 |

## Rollback

1. Revert `SpacePage.tsx` — removes Knowledge Base UI
2. Delete `src/renderer/components/knowledge/`
3. Delete `src/renderer/stores/knowledge.store.ts`
4. Revert `execute.ts` + `send-message.ts` + `prompt.ts` — removes agent integration
5. Delete `src/main/ipc/knowledge.ts` + preload + renderer API entries
6. Delete `src/main/platform/memory/knowledge/`
7. Revert `index.ts` migration registration
8. Remove `pdf-parse` from `package.json`

Database tables (`knowledge_documents`, `knowledge_chunks`) remain in `vortex.db` — harmless, no active queries. Can be dropped in a future migration if needed.
