/**
 * Snapshot Tools (3 tools)
 *
 * Page state observation: accessibility snapshot, screenshot, JS evaluation.
 *
 * browser_snapshot — Primary observation tool (structured text, low cost).
 * browser_screenshot — Visual capture (only when layout/images matter).
 * browser_evaluate — Execute arbitrary JS in the page (escape hatch).
 */

import { z } from 'zod'
import { tool } from '../../agent/resolved-sdk'
import type { BrowserContext } from '../context'
import { textResult, imageResult, withTimeout, TOOL_TIMEOUT } from './helpers'

export function buildSnapshotTools(ctx: BrowserContext) {

const browser_snapshot = tool(
  'browser_snapshot',
  `Capture a structured text snapshot of the current page based on its accessibility tree. This is the primary way to observe page content — use it before every interaction and after every action that changes the page.

The snapshot lists every visible element with a unique identifier (uid). Use these UIDs to target elements in browser_click, browser_fill, browser_hover, and other interaction tools.

CRITICAL: UIDs are invalidated whenever the page changes. After any click, fill, navigation, or page update, you MUST take a fresh snapshot before interacting with elements. Using stale UIDs will target wrong elements or fail silently.

Prefer snapshot over browser_screenshot for all decision-making. Snapshot is structured text (low token cost), screenshot is a full image (high token cost). Use screenshot only when visual layout verification is needed (charts, images, CSS rendering).

When to use verbose mode:
- Default (verbose=false): concise output, sufficient for most interactions.
- verbose=true: includes ARIA attributes, roles, states — use when element semantics matter (e.g., checkbox checked state, menu expanded/collapsed, button disabled state).

If the page appears to still be loading (incomplete content, spinners), wait briefly (Bash: sleep 1-2) then snapshot again. Or use browser_wait_for to wait for specific text before snapshotting.`,
  {
    verbose: z.boolean().optional().describe(
      'Include full a11y tree details (ARIA attributes, roles, states). Default: false. Use true when element states matter (checked, expanded, disabled).'
    ),
    filePath: z.string().optional().describe(
      'Save snapshot to this file path instead of returning in the response. Useful for very large pages to avoid token overhead.'
    )
  },
  async (args) => {
    if (!ctx.getActiveViewId()) {
      return textResult('No active browser page. Use browser_navigate first.', true)
    }

    try {
      const snapshot = await withTimeout(
        ctx.createSnapshot(args.verbose || false),
        TOOL_TIMEOUT,
        'browser_snapshot'
      )
      const formatted = snapshot.format(args.verbose || false)

      if (args.filePath) {
        const { writeFileSync } = require('fs')
        writeFileSync(args.filePath, formatted, 'utf-8')
        return textResult(
          `Snapshot saved to: ${args.filePath}\n\nPage: ${snapshot.title}\nURL: ${snapshot.url}\nElements: ${snapshot.idToNode.size}`
        )
      }

      return textResult(formatted)
    } catch (error) {
      return textResult(`Snapshot failed: ${(error as Error).message}`, true)
    }
  }
)

const browser_screenshot = tool(
  'browser_screenshot',
  `Capture a visual screenshot of the current page or a specific element. Returns an image.

Use this only when visual information matters and browser_snapshot cannot answer your question:
- Verifying visual layout, styling, or CSS rendering.
- Reading content embedded in images, charts, or canvas elements.
- Handling CAPTCHAs or visual verification challenges.
- Confirming a visual state not captured in the accessibility tree.

For all other observation needs, prefer browser_snapshot — it's faster and uses fewer tokens.`,
  {
    format: z.enum(['png', 'jpeg', 'webp']).optional().describe(
      'Image format. Default: "png". Use "jpeg" or "webp" for smaller file sizes.'
    ),
    quality: z.number().optional().describe(
      'Compression quality 0-100 for JPEG and WebP. Ignored for PNG.'
    ),
    uid: z.string().optional().describe(
      'Capture a specific element by its uid from the latest snapshot. Omit to capture the full viewport.'
    ),
    fullPage: z.boolean().optional().describe(
      'Capture the entire scrollable page, not just the visible viewport. Cannot be used with uid.'
    ),
    filePath: z.string().optional().describe(
      'Save to this file path instead of returning in the response.'
    )
  },
  async (args) => {
    if (!ctx.getActiveViewId()) {
      return textResult('No active browser page.', true)
    }

    if (args.uid && args.fullPage) {
      return textResult('Cannot provide both uid and fullPage.', true)
    }

    try {
      const format = args.format || 'png'
      const result = await withTimeout(
        ctx.captureScreenshot({
          format,
          quality: format === 'png' ? undefined : args.quality,
          uid: args.uid,
          fullPage: args.fullPage || false
        }),
        TOOL_TIMEOUT,
        'browser_screenshot'
      )

      let message: string
      if (args.uid) {
        message = `Screenshot of element "${args.uid}".`
      } else if (args.fullPage) {
        message = 'Screenshot of full page.'
      } else {
        message = 'Screenshot of current viewport.'
      }

      if (args.filePath) {
        const { writeFileSync } = require('fs')
        const buffer = Buffer.from(result.data, 'base64')
        writeFileSync(args.filePath, buffer)
        return textResult(`${message}\nSaved to: ${args.filePath}`)
      }

      return imageResult(message, result.data, result.mimeType)
    } catch (error) {
      return textResult(`Screenshot failed: ${(error as Error).message}`, true)
    }
  }
)

const browser_evaluate = tool(
  'browser_evaluate',
  `Execute JavaScript in the current browser page. The code runs in the page's own JS context — equivalent to the Chrome DevTools Console.

Available: all Web APIs (window, document, fetch, localStorage, navigator, etc.), the page's own variables and functions, full DOM access.
NOT available (browser context, not Node.js): require(), import, fs, path, process, Buffer.

IMPORTANT: pass a bare arrow function — it is auto-invoked. Do NOT self-invoke or use function declarations.

  Correct:  () => document.title
  Correct:  async () => { const r = await fetch('/api'); return r.json() }
  WRONG:    (() => document.title)()        — do not self-invoke
  WRONG:    function() { return 1 }         — must be arrow function

Return values must be JSON-serializable. Non-serializable values (DOM nodes, functions, undefined) return {}. To inspect a DOM element, extract its properties into a plain object.

Examples:
  Get page title:           { function: "() => document.title" }
  Scroll to bottom:         { function: "() => { window.scrollTo(0, document.body.scrollHeight); return 'done' }" }
  Extract data from DOM:    { function: "() => Array.from(document.querySelectorAll('.item')).map(el => ({ text: el.innerText, href: el.querySelector('a')?.href }))" }
  Call page API:            { function: "async () => { const r = await fetch('/api/data'); return r.json() }" }
  Inspect element by uid:   { function: "(el) => ({ value: el.value, disabled: el.disabled })", args: [{ uid: "s1_42" }] }
  Resize viewport:          { function: "() => { window.resizeTo(768, 1024); return 'resized' }" }

This is the escape hatch — use it for anything other tools cannot handle: custom scrolling, viewport resize, direct API calls, complex DOM queries, or page-specific JavaScript interactions.`,
  {
    function: z.string().describe(
      'Arrow function expression to execute in the page. Auto-invoked — do NOT wrap in IIFE. Must return a JSON-serializable value.'
    ),
    args: z.array(z.object({
      uid: z.string().describe('The uid of an element from the latest browser_snapshot.')
    })).optional().describe(
      'Page elements to pass as function arguments. Each uid is resolved to its DOM node and passed positionally.'
    )
  },
  async (args) => {
    if (!ctx.getActiveViewId()) {
      return textResult('No active browser page.', true)
    }

    try {
      const elementArgs: unknown[] = []
      if (args.args && args.args.length > 0) {
        for (const arg of args.args) {
          const element = ctx.getElementByUid(arg.uid)
          if (!element) {
            throw new Error(`Element not found: ${arg.uid}`)
          }
          elementArgs.push(element)
        }
      }

      const result = await withTimeout(
        ctx.evaluateScript(args.function, elementArgs),
        TOOL_TIMEOUT,
        'browser_evaluate'
      )
      const resultStr = typeof result === 'object'
        ? JSON.stringify(result, null, 2)
        : String(result)

      return textResult(`Script result:\n\`\`\`json\n${resultStr}\n\`\`\``)
    } catch (error) {
      return textResult(`Script error: ${(error as Error).message}`, true)
    }
  }
)

return [
  browser_snapshot,
  browser_screenshot,
  browser_evaluate
]

} // end buildSnapshotTools
