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
      const bytes = new Uint8Array(content)
      let binary = ''
      const chunkSize = 8192
      for (let j = 0; j < bytes.length; j += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(j, j + chunkSize))
      }
      files.push({
        name: file.name,
        content: btoa(binary),
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
                  <div
                    key={`${r.documentId}-${r.chunkIndex}-${i}`}
                    className="px-3 py-2 text-sm rounded border border-border/50 hover:bg-secondary/30 cursor-pointer"
                    onClick={() => handleDocClick(r.documentName, r.documentName)}
                  >
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