/**
 * Tab Management Tool (1 tool)
 *
 * Manage browser tabs: list, switch, close.
 * Consolidates browser_list_pages, browser_select_page, and browser_close_page
 * into a single intent-level tool.
 *
 * The original per-action tools remain available as standalone exports
 * in navigation.ts for future extension/advanced mode.
 */

import { z } from 'zod'
import { tool } from '../../agent/resolved-sdk'
import type { BrowserContext } from '../context'
import { browserViewManager } from '../../browser-view.service'
import { textResult } from './helpers'

const log = (...args: unknown[]) => console.log('[AI Browser][tab]', ...args)

export function buildTabTools(ctx: BrowserContext) {

const browser_tab = tool(
  'browser_tab',
  `Manage browser tabs: list all open tabs, switch between them, or close a tab.

Examples:
  List all tabs:              { action: "list" }
  Switch to tab at index 2:   { action: "select", pageIdx: 2 }
  Close tab at index 1:       { action: "close", pageIdx: 1 }

After switching tabs with "select", take a browser_snapshot to see the selected tab's content and get fresh UIDs. Tab indices may shift after closing a tab — use "list" to get current indices.

The last remaining tab cannot be closed.`,
  {
    action: z.enum(['list', 'select', 'close']).describe(
      'Tab management action: "list" shows all open tabs with index/title/URL, "select" switches to a tab, "close" closes a tab.'
    ),
    pageIdx: z.number().optional().describe(
      'Tab index — required for "select" and "close". Get indices from action: "list".'
    )
  },
  async (args) => {
    const states = browserViewManager.getAllStates()

    switch (args.action) {
      case 'list': {
        if (states.length === 0) {
          return textResult('No browser pages are currently open.')
        }
        const lines = ['Open browser pages:']
        states.forEach((state, index) => {
          lines.push(`[${index}] ${state.title || 'Untitled'} - ${state.url || 'about:blank'}`)
        })
        return textResult(lines.join('\n'))
      }

      case 'select': {
        if (args.pageIdx === undefined) {
          return textResult('pageIdx is required for action "select".', true)
        }
        if (args.pageIdx < 0 || args.pageIdx >= states.length) {
          return textResult(
            `Invalid page index: ${args.pageIdx}. Valid range: 0-${states.length - 1}`,
            true
          )
        }
        const state = states[args.pageIdx]
        ctx.setActiveViewId(state.id)
        log(`select page [${args.pageIdx}]: ${state.id}`)
        return textResult(
          `Selected page [${args.pageIdx}]: ${state.title || 'Untitled'} - ${state.url}`
        )
      }

      case 'close': {
        if (args.pageIdx === undefined) {
          return textResult('pageIdx is required for action "close".', true)
        }
        if (args.pageIdx < 0 || args.pageIdx >= states.length) {
          return textResult(`Invalid page index: ${args.pageIdx}`, true)
        }
        if (states.length === 1) {
          return textResult('The last open page cannot be closed.', true)
        }
        const closedState = states[args.pageIdx]
        const wasActive = ctx.getActiveViewId() === closedState.id
        browserViewManager.destroy(closedState.id)
        log(`close page [${args.pageIdx}]: ${closedState.id}, wasActive=${wasActive}`)

        // If we closed the active tab, switch to the nearest remaining tab
        if (wasActive) {
          const remaining = browserViewManager.getAllStates()
          if (remaining.length > 0) {
            // Prefer the tab at the same index; fall back to the last tab
            const newIdx = Math.min(args.pageIdx, remaining.length - 1)
            ctx.setActiveViewId(remaining[newIdx].id)
            log(`auto-switched to page [${newIdx}]: ${remaining[newIdx].id}`)
          }
        }

        return textResult(`Closed page [${args.pageIdx}]: ${closedState.title || 'Untitled'}`)
      }
    }
  }
)

return [browser_tab]

} // end buildTabTools
