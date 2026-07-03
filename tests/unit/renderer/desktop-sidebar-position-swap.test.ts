import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../../..')
const readSource = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf-8')
const compact = (source: string) => source.replace(/\s+/g, ' ')

describe('desktop sidebar position swap', () => {
  it('renders the desktop artifact rail before the chat area and the conversation list after it', () => {
    const source = readSource('src/renderer/pages/SpacePage.tsx')

    const mainContentIndex = source.indexOf('{/* Main content */}')
    const desktopArtifactIndex = source.indexOf('side="left"', mainContentIndex)
    const chatViewIndex = source.indexOf('<ChatView isCompact={isCanvasOpen} />', mainContentIndex)
    const desktopConversationIndex = source.indexOf('side="right"', mainContentIndex)
    const mobileArtifactIndex = source.indexOf('<ArtifactRail />', desktopConversationIndex)

    expect(desktopArtifactIndex).toBeGreaterThan(mainContentIndex)
    expect(chatViewIndex).toBeGreaterThan(desktopArtifactIndex)
    expect(desktopConversationIndex).toBeGreaterThan(chatViewIndex)
    expect(mobileArtifactIndex).toBeGreaterThan(desktopConversationIndex)
  })

  it('keeps the hidden conversation-list toggle on the right side of the chat area', () => {
    const source = readSource('src/renderer/pages/SpacePage.tsx')

    expect(source).toContain('<div className="absolute top-2 right-0 z-10">')
    expect(source).not.toContain('<div className="absolute top-2 left-0 z-10">')
  })

  it('makes ConversationList side-aware for right-side resizing and borders', () => {
    const source = compact(readSource('src/renderer/components/chat/ConversationList.tsx'))

    expect(source).toContain("side?: 'left' | 'right'")
    expect(source).toContain("side = 'left'")
    expect(source).toContain("side === 'right' ? containerRect.right - e.clientX : e.clientX - containerRect.left")
    expect(source).toContain("side === 'right' ? 'border-l' : 'border-r'")
    expect(source).toContain("side === 'right' ? 'left-0' : 'right-0'")
  })

  it('makes ArtifactRail side-aware for left-side resizing and borders without changing mobile usage', () => {
    const source = compact(readSource('src/renderer/components/artifact/ArtifactRail.tsx'))

    expect(source).toContain("side?: 'left' | 'right'")
    expect(source).toContain("side = 'right'")
    expect(source).toContain("side === 'left' ? e.clientX - rect.left : rect.right - e.clientX")
    expect(source).toContain("side === 'left' ? 'border-r' : 'border-l'")
    expect(source).toContain("side === 'left' ? 'right-0' : 'left-0'")
  })

  it('renders the browser artifact-rail action before the folder action in expanded and collapsed states', () => {
    const source = readSource('src/renderer/components/artifact/ArtifactRail.tsx')
    const footerIndex = source.indexOf('const renderFooter = () =>')
    const footerBrowserButtonIndex = source.indexOf('onClick={handleOpenBrowser}', footerIndex)
    const footerFolderButtonIndex = source.indexOf('onClick={handleOpenFolder}', footerIndex)
    const collapsedIndex = source.indexOf('{/* Collapsed state - show both folder and browser icons */}')
    const collapsedBrowserButtonIndex = source.indexOf('onClick={handleOpenBrowser}', collapsedIndex)
    const collapsedFolderButtonIndex = source.indexOf('onClick={handleOpenFolder}', collapsedIndex)

    expect(footerBrowserButtonIndex).toBeGreaterThan(footerIndex)
    expect(footerFolderButtonIndex).toBeGreaterThan(footerBrowserButtonIndex)
    expect(collapsedBrowserButtonIndex).toBeGreaterThan(collapsedIndex)
    expect(collapsedFolderButtonIndex).toBeGreaterThan(collapsedBrowserButtonIndex)
  })

  it('exposes a strongly confirmed clear conversations action in the conversation list header', () => {
    const source = readSource('src/renderer/components/chat/ConversationList.tsx')

    expect(source).toContain("import { useConfirmDialog } from '../../hooks/useConfirmDialog'")
    expect(source).toContain("title: t('Clear all conversations?')")
    expect(source).toContain("message: t('This will delete all conversations in the current space, including pinned conversations. This cannot be undone.')")
    expect(source).toContain("variant: 'danger'")
    expect(source).toContain("useChatStore.getState().clearConversations(spaceId)")
    expect(source).toContain("t('Clear conversations')")
  })
})
