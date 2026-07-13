/**
 * Command panel store — open/close state and keyboard selection.
 *
 * Kept separate from search.store because the command panel has different
 * semantics (no scope, no highlight bar, no progress). Selected index is
 * clamped to the visible list by the component, not here — the store only
 * records the intent.
 */

import { create } from 'zustand'

interface CommandPanelState {
  isOpen: boolean
  query: string
  selectedIndex: number

  open: () => void
  close: () => void
  setQuery: (q: string) => void
  setSelectedIndex: (i: number) => void
  reset: () => void
}

export const useCommandPanelStore = create<CommandPanelState>((set) => ({
  isOpen: false,
  query: '',
  selectedIndex: 0,

  open: () => set({ isOpen: true, query: '', selectedIndex: 0 }),
  close: () => set({ isOpen: false }),
  setQuery: (q) => set({ query: q, selectedIndex: 0 }),
  setSelectedIndex: (i) => set({ selectedIndex: i }),
  reset: () => set({ isOpen: false, query: '', selectedIndex: 0 }),
}))
