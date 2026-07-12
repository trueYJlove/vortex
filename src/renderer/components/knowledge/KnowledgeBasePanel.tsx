/**
 * KnowledgeBasePanel - Knowledge base section embedded in ConversationList
 *
 * Renders as a collapsible section inside the ConversationList sidebar.
 * Shows uploaded documents with search, upload, and delete capabilities.
 */
import { useState, useCallback, useEffect } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Search, Trash2, Upload, X, FileText, AlertCircle } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useKnowledgeStore } from '../../stores/knowledge.store'
import { useSpaceStore } from '../../stores/space.store'

export function KnowledgeBasePanel() {
  const { t } = useTranslation()
  const currentSpace = useSpaceStore(state => state.currentSpace)
  const [collapsed, setCollapsed] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

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

  // Load documents when space changes
  useEffect(() => {
    if (currentSpace?.id) {
      loadDocuments(currentSpace.id)
    }
  }, [currentSpace?.id, loadDocuments])

  const handleToggle = useCallback(() => {
    setCollapsed(prev => !prev)
  }, [])

  const handleUpload = useCallback(async () => {
    if (!currentSpace?.id) return
    await uploadDocuments(currentSpace.id)
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
      searchDocuments(currentSpace.id, value, 5)
    } else {
      clearSearch()
    }
  }, [currentSpace?.id, searchDocuments, clearSearch])

  const displayResults = showSearch && searchQuery.trim() ? searchResults : null

  return (
    <div className="border-b border-border">
      {/* Header */}
      <button
        onClick={handleToggle}
        title={t('Knowledge base documents for this space')}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/30 transition-colors"
      >
        {collapsed
          ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        }
        <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground/80 flex-1 text-left">
          {t('Knowledge Base')}
        </span>
        <span className="text-xs text-muted-foreground/60 tabular-nums">
          {documents.length}
        </span>
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="px-2 pb-2 space-y-1">
          {/* Action buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleUpload}
              disabled={isUploading}
              title={t('Upload documents')}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-secondary transition-colors disabled:opacity-50"
            >
              <Upload className="w-3 h-3" />
              <span>{isUploading ? t('Uploading...') : t('Upload')}</span>
            </button>
            <button
              onClick={handleSearchToggle}
              title={t('Search documents')}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${showSearch ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
            >
              <Search className="w-3 h-3" />
            </button>
          </div>

          {/* Search input */}
          {showSearch && (
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder={t('Search knowledge base...')}
                className="w-full text-xs px-2 py-1 pr-6 bg-secondary/50 rounded border border-border focus:outline-none focus:border-primary/50"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); clearSearch() }}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center gap-2 px-2 py-2">
              <div className="w-3 h-3 border border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">{t('Loading...')}</span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-destructive bg-destructive/5 rounded">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}

          {/* Search results */}
          {displayResults !== null && displayResults.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-[10px] text-muted-foreground/60 px-2 py-1">
                {t('Search results')}
              </div>
              {displayResults.map((r, i) => (
                <div key={`${r.documentId}-${r.chunkIndex}`} className="px-2 py-1 text-xs rounded hover:bg-secondary/50">
                  <div className="flex items-center gap-1">
                    <FileText className="w-2.5 h-2.5 text-muted-foreground" />
                    <span className="truncate flex-1">{r.documentName}</span>
                    <span className="text-[10px] text-muted-foreground/40">{(r.score * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-2">{r.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Search empty state */}
          {displayResults !== null && displayResults.length === 0 && !isSearching && searchQuery.trim() && (
            <div className="px-2 py-2 text-xs text-muted-foreground/60 text-center">
              {t('No results found')}
            </div>
          )}

          {/* Search searching state */}
          {isSearching && (
            <div className="flex items-center gap-2 px-2 py-2">
              <div className="w-3 h-3 border border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">{t('Searching...')}</span>
            </div>
          )}

          {/* Document list */}
          {displayResults === null && documents.length > 0 && (
            <div className="space-y-0.5">
              {documents.map(doc => (
                <div key={doc.id} className="group flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-secondary/50">
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

          {/* Empty state */}
          {displayResults === null && documents.length === 0 && !isLoading && !error && (
            <div className="px-2 py-3 text-xs text-muted-foreground/60 text-center">
              <FileText className="w-4 h-4 mx-auto mb-1 opacity-50" />
              <p>{t('No documents yet')}</p>
              <button
                onClick={handleUpload}
                className="mt-1 text-primary hover:underline"
              >
                {t('Upload your first document')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}