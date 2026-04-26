/**
 * Navigation Tools (2 tools)
 *
 * Core navigation and wait.
 *
 * browser_navigate — URL navigation (current tab or new tab) + history actions.
 *   Absorbs the former browser_new_page (via newTab parameter).
 * browser_wait_for — Wait for text to appear on the page.
 *
 * Tab management (list/select/close) has moved to tab.ts.
 * Viewport resize has moved to browser_evaluate (escape hatch).
 * The original standalone tools remain in their source files for future extension.
 *
 * browser_handle_dialog — Removed from registration. Native JS dialogs (alert/confirm/prompt)
 *   cannot be reliably intercepted in Electron BrowserView. Code preserved below for reference.
 */

import { z } from 'zod'
import { tool } from '../../agent/resolved-sdk'
import type { BrowserContext } from '../context'
import { browserViewManager, type DeviceMode } from '../../browser-view.service'
import { textResult, NAV_TIMEOUT } from './helpers'

export function buildNavigationTools(ctx: BrowserContext) {

const browser_navigate = tool(
  'browser_navigate',
  `Navigate to a URL or control browser history. This is the single entry point for all navigation.

Open a URL (current tab):       { url: "https://example.com" }
Open a URL (new tab):           { url: "https://example.com", newTab: true }
Open mobile site (new tab):     { url: "https://m.example.com", newTab: true, device: "h5" }
Go back in history:             { action: "back" }
Go forward in history:          { action: "forward" }
Reload the page:                { action: "reload" }

After any navigation, always take a browser_snapshot to see the loaded page and get element UIDs. If the page is still loading (spinner visible, content incomplete), wait briefly (Bash: sleep 1-2) then snapshot again.

Use newTab: true when you need to keep the current page open (e.g., comparing content across pages, copying data between tabs). Default behavior navigates the current tab.

Use device: "h5" only when the target site is mobile-only or the user explicitly requests mobile view. Default is desktop (PC) mode. Only valid with newTab: true.`,
  {
    url: z.string().optional().describe(
      'URL to navigate to. Use alone to navigate the current tab, or with newTab: true to open in a new tab.'
    ),
    action: z.enum(['back', 'forward', 'reload']).optional().describe(
      'History navigation or reload. Cannot be used together with url.'
    ),
    newTab: z.boolean().optional().describe(
      'Open the URL in a new tab instead of navigating the current tab. Only valid with url. Default: false.'
    ),
    device: z.enum(['pc', 'h5']).optional().describe(
      'Device mode for new tabs. "h5" emulates mobile (iPhone UA, 390×844 viewport). Only valid with newTab: true. Default: "pc".'
    ),
    timeout: z.number().int().optional().describe(
      'Maximum wait time in milliseconds for page load. Default: 30000. Set to 0 to use default.'
    )
  },
  async (args) => {
    const timeout = (args.timeout && args.timeout > 0) ? args.timeout : NAV_TIMEOUT

    // --- Parameter validation ---

    if (args.url && args.action) {
      return textResult(
        'Cannot provide both url and action. Use url to navigate to a page, or action for back/forward/reload.',
        true
      )
    }

    if (!args.url && !args.action) {
      return textResult(
        'Provide url to navigate to a page, or action (back/forward/reload).',
        true
      )
    }

    if (args.newTab && !args.url) {
      return textResult('newTab requires a url.', true)
    }

    if (args.device && !args.newTab) {
      return textResult('device requires newTab: true.', true)
    }

    // --- New tab navigation ---

    if (args.url && args.newTab) {
      const deviceMode: DeviceMode = args.device ?? 'pc'

      try {
        const viewId = `ai-browser-${Date.now()}`
        // Scoped (automation) contexts use the offscreen host window to isolate
        // view lifecycle from the user's mainWindow.
        await browserViewManager.create(viewId, args.url, {
          offscreen: ctx.isScoped,
          deviceMode,
        })
        ctx.trackView(viewId)
        ctx.setActiveViewId(viewId)

        // Wait for navigation with timeout protection
        await ctx.waitForNavigation(timeout)

        const finalState = browserViewManager.getState(viewId)
        const modeLabel = deviceMode === 'h5' ? ' [H5 mobile mode]' : ''
        return textResult(
          `Created new page${modeLabel}: ${finalState?.title || 'Untitled'} - ${finalState?.url || args.url}`
        )
      } catch (error) {
        return textResult(`Failed to create new page: ${(error as Error).message}`, true)
      }
    }

    // --- Current tab URL navigation ---

    if (args.url) {
      const viewId = ctx.getActiveViewId()
      if (!viewId) {
        return textResult(
          'No active browser page. Use newTab: true to open a URL in a new tab.',
          true
        )
      }

      try {
        await browserViewManager.navigate(viewId, args.url)
        await ctx.waitForNavigation(timeout)

        const finalState = browserViewManager.getState(viewId)
        return textResult(`Navigated to: ${finalState?.url || args.url}`)
      } catch (error) {
        return textResult(`Navigation failed: ${(error as Error).message}`, true)
      }
    }

    // --- History / reload actions ---

    const viewId = ctx.getActiveViewId()
    if (!viewId) {
      return textResult(
        'No active browser page. Navigate to a URL first with: { url: "...", newTab: true }',
        true
      )
    }

    try {
      switch (args.action) {
        case 'back':
          browserViewManager.goBack(viewId)
          break
        case 'forward':
          browserViewManager.goForward(viewId)
          break
        case 'reload':
          browserViewManager.reload(viewId)
          break
      }
      await ctx.waitForNavigation(timeout)

      const finalState = browserViewManager.getState(viewId)
      return textResult(`${args.action} completed: ${finalState?.url || '(unknown)'}`)
    } catch (error) {
      return textResult(`Navigation ${args.action} failed: ${(error as Error).message}`, true)
    }
  }
)

const browser_wait_for = tool(
  'browser_wait_for',
  `Wait for specific text to appear on the page before proceeding. Useful after actions that trigger asynchronous loading — form submissions, AJAX updates, page transitions, single-page app route changes.

Returns success when the text is found in the page's accessibility tree, or an error on timeout. After success, take a browser_snapshot to see the updated page and get fresh UIDs.

If the text never appears (misspelled, not in the accessibility tree, loaded in an iframe), the tool times out. In that case, take a browser_snapshot anyway to see what actually loaded and adjust your approach.

Default timeout: 30 seconds.`,
  {
    text: z.string().describe('Text to wait for on the page. Must be an exact substring match against the page content.'),
    timeout: z.number().int().optional().describe(
      'Maximum wait time in milliseconds. Default: 30000. Set to 0 to use default.'
    )
  },
  async (args) => {
    const timeout = (args.timeout && args.timeout > 0) ? args.timeout : NAV_TIMEOUT

    try {
      await ctx.waitForText(args.text, timeout)
      return textResult(`Text found: "${args.text}"`)
    } catch {
      return textResult(`Timeout waiting for text: "${args.text}" (waited ${timeout}ms)`, true)
    }
  }
)

const browser_handle_dialog = tool(
  'browser_handle_dialog',
  `Handle a browser dialog (alert, confirm, prompt). Dialogs block all other page interaction until they are dismissed.

If other browser tools fail unexpectedly, a dialog may be blocking the page — call this tool to check and dismiss it.

For prompt() dialogs that require text input, provide the promptText parameter before accepting.`,
  {
    action: z.enum(['accept', 'dismiss']).describe(
      'Accept (OK/Yes) or dismiss (Cancel/No) the dialog.'
    ),
    promptText: z.string().optional().describe(
      'Text to enter into a prompt() dialog before accepting. Ignored for alert and confirm dialogs.'
    )
  },
  async (args) => {
    const dialog = ctx.getPendingDialog()
    if (!dialog) {
      return textResult('No open dialog found.', true)
    }

    try {
      await ctx.handleDialog(args.action === 'accept', args.promptText)
      return textResult(
        `Dialog ${args.action === 'accept' ? 'accepted' : 'dismissed'} successfully.`
      )
    } catch (error) {
      return textResult(`Failed to handle dialog: ${(error as Error).message}`, true)
    }
  }
)

return [
  browser_navigate,
  browser_wait_for,
]

} // end buildNavigationTools
