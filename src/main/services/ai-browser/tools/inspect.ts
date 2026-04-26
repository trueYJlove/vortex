/**
 * Inspect Tool (1 tool)
 *
 * Inspect network requests or console messages from the current page.
 * Consolidates browser_network_requests, browser_network_request,
 * browser_console, and browser_console_message into a single intent-level tool.
 *
 * The original per-target tools remain available as standalone exports
 * in network.ts and console.ts for future extension/advanced mode.
 */

import { z } from 'zod'
import { tool } from '../../agent/resolved-sdk'
import type { BrowserContext } from '../context'
import { textResult } from './helpers'

const log = (...args: unknown[]) => console.log('[AI Browser][inspect]', ...args)

export function buildInspectTools(ctx: BrowserContext) {

const browser_inspect = tool(
  'browser_inspect',
  `Inspect network requests or console messages from the current page. Use this to understand the page's data layer — find API endpoints, check response payloads, or diagnose JavaScript errors.

Network inspection (target: "network"):
  List all requests:           { target: "network" }
  Filter by resource type:     { target: "network", resourceTypes: ["fetch", "xhr"] }
  Get request detail + body:   { target: "network", id: 42 }

  Powerful for data extraction: instead of scraping DOM, find the API endpoint the page calls, then use it directly via browser_evaluate with fetch(). Far more reliable and efficient than DOM scraping.

Console inspection (target: "console"):
  List all messages:           { target: "console" }
  Filter errors only:          { target: "console", types: ["error"] }
  Get message detail + stack:  { target: "console", id: 5 }

  Use this when page interactions fail unexpectedly — console errors reveal the cause. Common findings: JavaScript TypeError (broken page code), CORS errors (blocked API requests), CSP violations.`,
  {
    target: z.enum(['network', 'console']).describe(
      'What to inspect: "network" for HTTP requests, "console" for JS console messages.'
    ),
    id: z.number().optional().describe(
      'Request ID (for network) or message ID (for console) for a detailed view including headers, response body, or stack trace. Get IDs from a list call first.'
    ),
    resourceTypes: z.array(z.string()).optional().describe(
      'Network only: filter by resource type, e.g. ["fetch", "xhr", "document"]. Ignored when target is "console".'
    ),
    types: z.array(z.string()).optional().describe(
      'Console only: filter by message type, e.g. ["error", "warning"]. Ignored when target is "network".'
    ),
    limit: z.number().int().positive().optional().describe(
      'Maximum number of items to return. Default: all items.'
    ),
    offset: z.number().int().min(0).optional().describe(
      'Skip the first N items before applying limit. Use with limit for pagination through large result sets. Default: 0.'
    ),
    includePreserved: z.boolean().optional().describe(
      'Include entries preserved from the last 3 navigations. Default: false (current navigation only).'
    )
  },
  async (args) => {
    if (!ctx.getActiveViewId()) {
      return textResult('No active browser page. Use browser_navigate first.', true)
    }

    try {
      log(`${args.target}${args.id !== undefined ? ` id=${args.id}` : ' list'}`)
      if (args.target === 'network') {
        return args.id !== undefined
          ? await formatNetworkDetail(ctx, args.id)
          : formatNetworkList(ctx, args)
      } else {
        return args.id !== undefined
          ? formatConsoleDetail(ctx, args.id)
          : formatConsoleList(ctx, args)
      }
    } catch (error) {
      return textResult(`Inspect failed: ${(error as Error).message}`, true)
    }
  }
)

return [browser_inspect]

} // end buildInspectTools


// ============================================
// Network helpers
// ============================================

interface ListArgs {
  resourceTypes?: string[]
  types?: string[]
  limit?: number
  offset?: number
  includePreserved?: boolean
}

function formatNetworkList(ctx: BrowserContext, args: ListArgs) {
  let requests = ctx.getNetworkRequests(args.includePreserved || false)

  // Filter by resource type
  if (args.resourceTypes && args.resourceTypes.length > 0) {
    const typeSet = new Set(args.resourceTypes.map(t => t.toLowerCase()))
    requests = requests.filter(r => typeSet.has(r.resourceType.toLowerCase()))
  }

  const total = requests.length
  const offset = args.offset || 0
  const sliced = args.limit !== undefined
    ? requests.slice(offset, offset + args.limit)
    : requests.slice(offset)

  if (sliced.length === 0) {
    return textResult('No network requests captured.')
  }

  const lines: string[] = []
  if (args.limit !== undefined || offset > 0) {
    const endIdx = offset + sliced.length
    lines.push(`Network Requests (${offset + 1}-${endIdx} of ${total}):`)
  } else {
    lines.push(`Network Requests (${total} total):`)
  }
  lines.push('')

  for (const req of sliced) {
    const status = req.status ? `${req.status}` : 'pending'
    const duration = req.timing?.duration ? `${req.timing.duration}ms` : '-'
    // Display numeric ID only (strip "req_" prefix) so it matches the `id` parameter format
    const displayId = req.id.replace(/^req_/, '')
    lines.push(`[id=${displayId}] ${req.method} ${status} ${req.resourceType}`)
    lines.push(`    URL: ${req.url.substring(0, 100)}${req.url.length > 100 ? '...' : ''}`)
    lines.push(`    Duration: ${duration}`)
    if (req.error) {
      lines.push(`    Error: ${req.error}`)
    }
    lines.push('')
  }

  if (args.limit !== undefined && offset + sliced.length < total) {
    lines.push(`Use offset=${offset + sliced.length} to see more.`)
  }

  return textResult(lines.join('\n'))
}

async function formatNetworkDetail(ctx: BrowserContext, reqid: number) {
  const request = ctx.getNetworkRequest(`req_${reqid}`)

  if (!request) {
    return textResult(`Network request not found: reqid=${reqid}`, true)
  }

  const lines = [
    `# Network Request: reqid=${request.id}`,
    '',
    `## Basic Info`,
    `URL: ${request.url}`,
    `Method: ${request.method}`,
    `Resource Type: ${request.resourceType}`,
    `Status: ${request.status || 'pending'} ${request.statusText || ''}`,
    `MIME Type: ${request.mimeType || 'unknown'}`,
    ''
  ]

  if (request.timing) {
    lines.push(`## Timing`)
    lines.push(`Duration: ${request.timing.duration}ms`)
    lines.push('')
  }

  if (request.requestHeaders && Object.keys(request.requestHeaders).length > 0) {
    lines.push(`## Request Headers`)
    for (const [key, value] of Object.entries(request.requestHeaders)) {
      lines.push(`${key}: ${value}`)
    }
    lines.push('')
  }

  if (request.responseHeaders && Object.keys(request.responseHeaders).length > 0) {
    lines.push(`## Response Headers`)
    for (const [key, value] of Object.entries(request.responseHeaders)) {
      lines.push(`${key}: ${value}`)
    }
    lines.push('')
  }

  if (request.requestBody) {
    lines.push(`## Request Body`)
    lines.push('```')
    lines.push(request.requestBody.substring(0, 2000))
    if (request.requestBody.length > 2000) {
      lines.push('... (truncated)')
    }
    lines.push('```')
    lines.push('')
  }

  // Fetch response body via CDP
  const responseBody = await ctx.getNetworkResponseBody(request.id)
  if (responseBody) {
    lines.push(`## Response Body`)
    lines.push('```')
    lines.push(responseBody.substring(0, 4000))
    if (responseBody.length > 4000) {
      lines.push(`... (truncated, total ${responseBody.length} chars)`)
    }
    lines.push('```')
    lines.push('')
  }

  if (request.error) {
    lines.push(`## Error`)
    lines.push(request.error)
  }

  return textResult(lines.join('\n'))
}


// ============================================
// Console helpers
// ============================================

function formatConsoleList(ctx: BrowserContext, args: ListArgs) {
  let messages = ctx.getConsoleMessages(args.includePreserved || false)

  // Filter by type
  if (args.types && args.types.length > 0) {
    const typeSet = new Set(args.types)
    messages = messages.filter(m => typeSet.has(m.type))
  }

  const total = messages.length
  const offset = args.offset || 0
  const sliced = args.limit !== undefined
    ? messages.slice(offset, offset + args.limit)
    : messages.slice(offset)

  if (sliced.length === 0) {
    return textResult('No console messages captured.')
  }

  const lines: string[] = []
  if (args.limit !== undefined || offset > 0) {
    const endIdx = offset + sliced.length
    lines.push(`Console Messages (${offset + 1}-${endIdx} of ${total}):`)
  } else {
    lines.push(`Console Messages (${total} total):`)
  }
  lines.push('')

  for (const msg of sliced) {
    const time = new Date(msg.timestamp).toLocaleTimeString()
    // Display numeric ID only (strip "msg_" prefix) so it matches the `id` parameter format
    const displayId = msg.id.replace(/^msg_/, '')
    lines.push(`[id=${displayId}] ${msg.type.toUpperCase()} (${time})`)
    lines.push(`    ${msg.text.substring(0, 200)}${msg.text.length > 200 ? '...' : ''}`)
    if (msg.url) {
      lines.push(`    at ${msg.url}${msg.lineNumber !== undefined ? `:${msg.lineNumber}` : ''}`)
    }
    lines.push('')
  }

  if (args.limit !== undefined && offset + sliced.length < total) {
    lines.push(`Use offset=${offset + sliced.length} to see more.`)
  }

  return textResult(lines.join('\n'))
}

function formatConsoleDetail(ctx: BrowserContext, msgid: number) {
  const message = ctx.getConsoleMessage(`msg_${msgid}`)

  if (!message) {
    return textResult(`Console message not found: msgid=${msgid}`, true)
  }

  const time = new Date(message.timestamp).toLocaleString()

  const lines = [
    `# Console Message: msgid=${message.id}`,
    '',
    `## Type: ${message.type.toUpperCase()}`,
    `Timestamp: ${time}`,
    ''
  ]

  if (message.url) {
    lines.push(`## Source`)
    lines.push(`File: ${message.url}`)
    if (message.lineNumber !== undefined) {
      lines.push(`Line: ${message.lineNumber}`)
    }
    lines.push('')
  }

  lines.push(`## Message`)
  lines.push('```')
  lines.push(message.text)
  lines.push('```')

  if (message.stackTrace) {
    lines.push('')
    lines.push(`## Stack Trace`)
    lines.push('```')
    lines.push(message.stackTrace)
    lines.push('```')
  }

  if (message.args && message.args.length > 0) {
    lines.push('')
    lines.push(`## Arguments`)
    lines.push('```json')
    lines.push(JSON.stringify(message.args, null, 2))
    lines.push('```')
  }

  return textResult(lines.join('\n'))
}
