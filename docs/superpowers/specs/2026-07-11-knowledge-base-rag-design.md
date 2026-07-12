# Knowledge Base / RAG — Design

## Background

Halo's memory system (`platform/memory`) provides cross-session persistence via Markdown files (`memory.md`). The agent receives `# now` block content via prompt injection and uses native Read/Edit/Write tools to manage memory content.

However, the memory system has critical gaps for a knowledge-driven AI companion:

- **No document retrieval** — Users cannot upload external documents for the agent to reference.
- **No semantic or full-text search** — Retrieval relies solely on heading matching, inefficient for large knowledge corpora.
- **No document parsing/chunking** — External files (PDF, Markdown, etc.) cannot be split into searchable chunks.
- **No knowledge injection** — The agent has no way to access space-scoped knowledge beyond its `memory.md` working state.

This design introduces a Knowledge Base system that closes these gaps, enabling users to upload documents and have the agent automatically retrieve relevant fragments during conversations and automation runs.

## Goal

Deliver a complete minimal closed loop:

1. **User uploads documents** (txt, md, json, csv, pdf) to a Space-scoped knowledge base.
2. **Space artifacts are auto-indexed** — files in the Space's `artifacts/` directory are automatically included.
3. **Documents are parsed, chunked, and indexed** in SQLite with FTS5 full-text search.
4. **Agent receives a knowledge summary** in its initial message (what knowledge is available).
5. **Agent calls `knowledge_search` MCP tool** on demand to retrieve relevant fragments.
6. **Search results are returned** to the agent as tool output, consumed in the current turn.

## Non-Goals

- **No vector / semantic search in Phase 1.** FTS5 keyword search only. Vector search is Phase 2.
- **No user-level or app-level knowledge base.** Space-scoped only. The `KnowledgeService` interface reserves a `scope` parameter for future extension, but only `space` scope is implemented in Phase 1.
- **No directory scanning.** Users cannot point at an arbitrary local directory for bulk indexing. Only manual upload + Space artifact auto-index are supported.
- **No Office document formats** (Word, Excel, PowerPoint). Phase 1 supports txt, md, json, csv, pdf only.
- **No code file semantic chunking** (per-function or per-class). Code files are not indexed in Phase 1.
- **No local Embedding model.** Phase 2 vector search will reuse the user's existing AI Sources API Key (e.g., OpenAI `text-embedding-3-small`). This decision is recorded here so the Phase 1 interface can pre-reserve the `embeddingConfig` field.
- **No knowledge base management UI beyond basic upload/list/delete.** Advanced features (re-index, search preview, relevance feedback) are deferred.
- **No knowledge base in `CollapsedThoughtProcess` or any history view.** Knowledge search is a tool call; it appears in the existing tool call rendering pipeline.

## Architecture

### Layer Placement

Knowledge Base is a new sub-module under `platform/memory`, not a new top-level platform service. Rationale:

- Knowledge is a memory concern — it provides context to the agent, same as `memory.md`.
- It shares the SQLite infrastructure from `platform/store`.
- It is consumed by `apps/runtime/execute.ts` alongside the existing memory snapshot injection.
- Keeping it under `platform/memory` preserves the layering rule: `apps/runtime` → `platform/*` → `foundation/*`.

```
src/main/platform/memory/
  knowledge/                   ← NEW
    index.ts                   — KnowledgeService init + public API
    fts.ts                     — FTS5 full-text search
    chunking.ts                — Document parsing and chunking
    pdf-parser.ts              — PDF text extraction
    types.ts                   — KnowledgeService types
    migrations.ts              — Knowledge DB migrations
```

### Database

Uses the existing `DatabaseManager` from `platform/store`. A new migration namespace `knowledge` is registered via `runMigrations(db, 'knowledge', migrations)`.

**Schema:**

```sql
-- Document metadata
CREATE TABLE knowledge_documents (
  id TEXT PRIMARY KEY,              -- UUID
  space_id TEXT NOT NULL,
  source TEXT NOT NULL,             -- 'upload' | 'artifact'
  source_path TEXT NOT NULL,        -- Original file path or artifact path
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,          -- 'txt' | 'md' | 'json' | 'csv' | 'pdf'
  content_hash TEXT NOT NULL,       -- SHA-256, for deduplication and change detection
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(space_id, source_path)
);

-- FTS5 virtual table for chunk content
CREATE VIRTUAL TABLE knowledge_chunks USING fts5(
  document_id UNINDEXED,
  space_id UNINDEXED,
  chunk_index,
  content,
  tokenize = 'unicode61'
);
```

**FTS5 note:** `better-sqlite3` ships with SQLite compiled with FTS5 enabled — no additional dependency required. This needs verification at implementation start; if FTS5 is not available, a fallback to `LIKE`-based search with an external trigram index is the backup plan.

### Core Types (`types.ts`)

```typescript
export type KnowledgeScope = 'space'  // Phase 1: only 'space'. Future: 'user' | 'app'

export type DocumentFileType = 'txt' | 'md' | 'json' | 'csv' | 'pdf'

export type DocumentSource = 'upload' | 'artifact'

export interface KnowledgeDocument {
  id: string
  spaceId: string
  source: DocumentSource
  sourcePath: string
  fileName: string
  fileType: DocumentFileType
  contentHash: string
  chunkCount: number
  createdAt: number
  updatedAt: number
}

export interface SearchResult {
  documentId: string
  documentName: string
  chunkIndex: number
  content: string
  score: number               — FTS5 rank
}

export interface KnowledgeSearchParams {
  scope: KnowledgeScope
  spaceId: string
  query: string
  topK?: number               — default 5
}

export interface KnowledgeService {
  indexDocument(params: {
    spaceId: string
    source: DocumentSource
    sourcePath: string
    content: string | Buffer  — Buffer for PDF
    fileType: DocumentFileType
  }): Promise<KnowledgeDocument>

  removeDocument(spaceId: string, sourcePath: string): Promise<void>

  listDocuments(spaceId: string): Promise<KnowledgeDocument[]>

  search(params: KnowledgeSearchParams): Promise<SearchResult[]>

  indexArtifact(spaceId: string, artifactPath: string): Promise<void>
  // Phase 2 placeholder — not implemented, but reserved on the interface
  searchSemantic?(params: KnowledgeSearchParams & { embedding: number[] }): Promise<SearchResult[]>
}
```

### Document Parsing & Chunking (`chunking.ts`)

**Supported file types:**

| Type | Parsing | Chunking |
|------|---------|----------|
| `txt` | Read as UTF-8 string | Split by double newlines (paragraphs), fallback to fixed 1000-char chunks with 200-char overlap |
| `md` | Read as UTF-8 string | Split by `##` headings; each section is a chunk. Fallback to paragraph splitting |
| `json` | Read as UTF-8 string | If array: each element is a chunk (JSON-stringified). If object: each top-level value is a chunk. Fallback: whole document as one chunk |
| `csv` | Read as UTF-8 string | Header row + each data row combined as a chunk. Large rows (>2000 chars) split further |
| `pdf` | `pdf-parser.ts` extracts text via `pdf-parse` library | Extracted text split by page breaks, fallback to paragraph splitting |

**Chunking constraints:**
- Min chunk size: 100 chars (smaller chunks merged with next)
- Max chunk size: 2000 chars (larger chunks split at nearest paragraph/line boundary)
- Overlap: 200 chars between adjacent chunks (preserves context across boundaries)

**PDF parsing:** Uses `pdf-parse` — a lightweight pure-JS library with no native dependencies. Added to `package.json` dependencies. Error handling: if PDF parsing fails (corrupted, encrypted), the document is indexed with an empty content chunk and a warning is logged.

### FTS5 Search (`fts.ts`)

```typescript
async function ftsSearch(
  db: Database.Database,
  spaceId: string,
  query: string,
  topK: number
): Promise<SearchResult[]>
```

- Uses FTS5 `MATCH` query with `rank` ordering.
- Query is sanitized: special FTS5 syntax characters (`"`, `*`, `:`) are escaped.
- Returns `SearchResult[]` with `score` = FTS5 rank (lower is better, negated for intuitive "higher is better" semantics).
- `topK` default: 5.

### Agent Integration

Two integration points, mirroring the memory system's dual-channel design:

#### 1. Prompt Injection (Summary)

When building the agent's initial message (in `apps/runtime/execute.ts` for automation, or in `services/agent/send-message.ts` for interactive chat), a **knowledge summary** is injected alongside the memory snapshot:

```
## Knowledge Base

This space has a knowledge base with {{document_count}} documents:
- {{file_name_1}} ({{file_type_1}}, {{chunk_count_1}} chunks)
- {{file_name_2}} ({{file_type_2}}, {{chunk_count_2}} chunks)
...

Use the `knowledge_search` tool to retrieve relevant content when you need to reference these documents.
```

Only document metadata is injected — not content. This keeps the prompt compact and lets the agent decide when to retrieve full fragments.

#### 2. MCP Tool (`knowledge_search`)

A new MCP server exposes the `knowledge_search` tool to the agent:

```typescript
// Registered alongside existing halo-memory, halo-report, halo-notify MCP servers
createKnowledgeSearchMcpServer({
  spaceId: string,
  knowledgeService: KnowledgeService
})
```

**Tool definition:**

```typescript
tool({
  name: 'knowledge_search',
  description: 'Search the space knowledge base for relevant document fragments. Use when you need to reference uploaded documents or Space artifacts.',
  parameters: {
    query: { type: 'string', description: 'Search query — keywords or phrases' },
    topK: { type: 'number', description: 'Max results to return (default 5)', optional: true }
  }
})
```

**Tool output:** Formatted text block:

```
Found 3 results for "API rate limiting":

[1] api-guide.pdf (chunk 4, score -2.1)
...content fragment...

[2] config.md (chunk 1, score -1.8)
...content fragment...
```

### Artifact Auto-Indexing

Space artifacts (files in `{space.path}/artifacts/`) are indexed automatically:

- **Trigger:** When `KnowledgeService` initializes for a space, it scans the artifacts directory.
- **Change detection:** SHA-256 content hash. If hash matches existing index, skip. If hash differs, re-index. If file is deleted, remove from index.
- **Supported types only:** Unsupported file types (e.g., `.png`, `.docx`) are silently skipped.
- **Debouncing:** File watcher events are debounced (500ms) to avoid re-indexing on rapid writes.
- **Integration with existing watcher:** Uses the existing `services/watcher-host.service.ts` infrastructure — no new file watcher is created.

### IPC Channels

New IPC module: `ipc/knowledge.ts`

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `knowledge:upload` | request | Upload a file to space knowledge base |
| `knowledge:list` | request | List documents in space knowledge base |
| `knowledge:delete` | request | Delete a document from knowledge base |
| `knowledge:search` | request | Manual search (for UI preview, not agent use) |
| `knowledge:reindex` | request | Force re-index of a document or all artifacts |
| `knowledge:status` | event | Emitted when indexing completes or errors |

**Sync checklist** (per `quick.md`):
- `src/main/ipc/knowledge.ts` — handler
- `src/preload/index.ts` — typed method
- `src/renderer/api/index.ts` — unified call
- HTTP route if remote-capable (Phase 1: not remote-capable — knowledge is local-file-based, remote clients cannot upload local files)

### Renderer UI

#### Space Page Integration

A new "Knowledge Base" section in `SpacePage.tsx`:

- **Document list:** Table with file name, type, chunk count, indexed time, delete button.
- **Upload button:** File picker dialog, accepts `.txt`, `.md`, `.json`, `.csv`, `.pdf`.
- **Search preview:** A text input + result display, letting the user test search queries before relying on the agent.
- **Status indicator:** Shows "Indexing..." when a document is being processed.

**Component structure:**

```
src/renderer/components/knowledge/     ← NEW directory
  KnowledgeBasePanel.tsx               — Main panel
  KnowledgeDocumentList.tsx            — Document table
  KnowledgeUploadButton.tsx            — Upload trigger
  KnowledgeSearchPreview.tsx           — Manual search test UI
```

**Styling:**
- Theme tokens only — no hardcoded colors.
- Mobile-first responsive: table becomes card list on `< 640px`.
- `t('English text')` for all user-facing strings.

## Data Flow

```
Document Upload (UI)
  → ipc/knowledge.ts (knowledge:upload)
  → KnowledgeService.indexDocument()
  → chunking.ts (parse + chunk)
  → SQLite: knowledge_documents + knowledge_chunks (FTS5)

Artifact Auto-Index
  → watcher-host.service.ts (file change event)
  → KnowledgeService.indexArtifact()
  → hash check → chunking.ts → SQLite

Agent Run (automation or interactive chat)
  → buildInitialMessage()
  → KnowledgeService.listDocuments() → inject summary into prompt
  → Agent sees summary, decides to call knowledge_search
  → MCP tool: KnowledgeService.search()
  → fts.ts → SQLite FTS5 query
  → Results returned as tool output to agent
```

## Performance

- **Indexing is async and debounced** — does not block agent runs or UI.
- **FTS5 query is sub-millisecond** for typical knowledge bases (< 10,000 chunks).
- **Content hash avoids redundant re-indexing** — unchanged files are skipped on artifact scans.
- **No startup impact** — `KnowledgeService` initializes in the extended phase, not essential startup.
- **Memory** — PDF parsing is streaming; large PDFs do not load entirely into memory.
- **No performance regression** — all indexing happens in background workers or debounced timers.

## Security

- **No credential storage** — Knowledge Base stores only document content, no API keys or tokens.
- **Content hashing** — SHA-256 for deduplication and change detection.
- **Space isolation** — Documents are scoped to `space_id`; cross-space queries are not possible.
- **File type whitelist** — Only supported file types are accepted; executable files and scripts are rejected.
- **Upload size limit** — 50 MB per file (configurable in future). Files exceeding the limit are rejected with a user-facing error.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Unsupported file type | Reject upload, show user-facing error |
| File exceeds size limit | Reject upload, show user-facing error |
| PDF parsing fails | Index with empty content, log warning, mark document as `parse_error` |
| FTS5 not available | Fall back to `LIKE`-based search; log warning at startup |
| Database write fails | Roll back transaction, return error to caller, UI shows retry option |
| Search returns no results | Return empty array; agent sees "No results found" in tool output |

## i18n

New user-facing strings (all wrapped in `t('English text')`):

- `'Knowledge Base'`
- `'Upload document'`
- `'Search knowledge base'`
- `'No documents yet'`
- `'Indexing...'`
- `'Delete document'`
- `'Search results'`
- `'No results found'`
- `'Unsupported file type'`
- `'File too large'`
- `'{{count}} chunks'`
- `'Last indexed {{date}}'`

Run `npm run i18n` before commit.

## Testing

### Unit Tests

`tests/unit/platform/memory/knowledge/`:

- `chunking.test.ts` — txt/md/json/csv/pdf parsing and chunking
- `fts.test.ts` — FTS5 search with various queries
- `migrations.test.ts` — Schema migration correctness
- `service.test.ts` — `KnowledgeService` index/remove/list/search end-to-end
- `artifact-index.test.ts` — Artifact auto-indexing with hash-based change detection

Run: `npm run test:unit -- tests/unit/platform/memory/knowledge/`

### Manual Verification

- Upload a PDF and a Markdown file, verify they appear in the document list
- Add a file to Space artifacts, verify it auto-appears in the document list
- Use the search preview UI, verify results are relevant
- Start a conversation, ask a question about an uploaded document, verify the agent calls `knowledge_search` and uses the result
- Delete a document, verify it is removed from search results
- Mobile (< 640px): verify the document list becomes a card list

## Validation Checklist

- [ ] Unit tests pass
- [ ] `npm run i18n` clean
- [ ] TypeScript compiles
- [ ] FTS5 availability verified in `better-sqlite3`
- [ ] `pdf-parse` dependency added and working
- [ ] Upload UI works on desktop and mobile
- [ ] Artifact auto-index works with hash-based change detection
- [ ] Agent receives knowledge summary in initial message
- [ ] `knowledge_search` MCP tool returns relevant results
- [ ] Agent can use search results to answer user questions
- [ ] Space isolation: documents in Space A not searchable from Space B

## Phase 2 Preview (Not in Scope)

- Vector / semantic search via Embedding API (reusing AI Sources config)
- `knowledge_embeddings` table with BLOB column for embedding vectors
- `KnowledgeService.searchSemantic()` implementation
- Hybrid search: FTS5 + vector results merged and re-ranked
- User-level and app-level knowledge base scopes
- Directory scanning for bulk import
- Code file semantic chunking (per-function, per-class)
- Re-index scheduling for stale documents

## Scope Extension Note

The `KnowledgeService` interface is designed with a `scope: KnowledgeScope` parameter from day one. Phase 1 implements only `scope === 'space'`, but the type signature and database schema (`space_id` column, with `user_id` / `app_id` columns to be added in Phase 2) are structured so that extending to `user` and `app` scopes requires no interface change — only new query filters and new database columns.
