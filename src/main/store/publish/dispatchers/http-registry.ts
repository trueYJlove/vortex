/**
 * Publish dispatcher for a private HTTP registry.
 *
 * Wire protocol:
 *   POST <registry-url>/apps
 *     Content-Type: multipart/form-data
 *     Authorization: Bearer <token>
 *     Fields: slug (text), version (text), dhpkg (file)
 *   Response 200: { slug, version, verdict: 'approved'|'rejected'|'needs_review', comment }
 *
 * Token is read from `registryOverrides.<id>.publish.token` in product.json.
 */

import { pack } from '../../dhpkg'
import type { AppSpec } from '../../../apps/spec'
import type { PublishContext, PublishResult } from '../types'

interface HttpRegistryConfig {
  /** Override registry url. Defaults to ctx.registryUrl. */
  url?: string
  token?: string
}

export async function dispatch(
  spec: AppSpec,
  files: Record<string, string | Buffer>,
  ctx: PublishContext,
  config: HttpRegistryConfig,
): Promise<PublishResult> {
  const url = config.url ?? ctx.registryUrl
  if (!url) {
    return {
      status: 'error',
      target: 'http-registry',
      details: 'http-registry publish target requires a registry URL (set via registryOverrides or product config)',
    }
  }

  if (!config.token || config.token === 'REPLACE_AT_DEPLOY_TIME') {
    return {
      status: 'error',
      target: 'http-registry',
      details: 'http-registry token is not configured (registryOverrides.<id>.publish.token).',
    }
  }

  const buf = await pack(spec, files)
  const endpoint = `${url.replace(/\/+$/, '')}/apps`
  console.log(`[publish/http-registry] POST ${endpoint} (bytes=${buf.byteLength})`)

  const form = new FormData()
  form.append('slug', spec.store?.slug ?? spec.name)
  form.append('version', spec.version ?? '0.0.0')
  form.append(
    'dhpkg',
    new Blob([new Uint8Array(buf)], { type: 'application/octet-stream' }),
    `${(spec.store?.slug ?? spec.name).replace(/[^a-z0-9-]/gi, '-')}.dhpkg`,
  )

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}` },
      body: form,
    })
  } catch (err) {
    return {
      status: 'error',
      target: 'http-registry',
      details: `Network error talking to registry: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  let body: { slug?: string; version?: string; verdict?: string; comment?: string } = {}
  try {
    body = await response.json() as typeof body
  } catch {
    body = {}
  }

  if (!response.ok) {
    return {
      status: 'error',
      target: 'http-registry',
      details: `Registry returned HTTP ${response.status}: ${body.comment ?? response.statusText}`,
    }
  }

  const verdict = body.verdict ?? 'submitted'
  const message =
    verdict === 'approved'
      ? `Published. ${body.comment ?? ''}`
      : verdict === 'rejected'
        ? `Rejected by registry: ${body.comment ?? '(no comment)'}`
        : `Submitted (verdict=${verdict}): ${body.comment ?? ''}`

  console.log(`[publish/http-registry] ${spec.name} -> ${verdict}`)
  return {
    status: verdict === 'rejected' ? 'error' : 'success',
    target: 'http-registry',
    details: message,
    verdict,
  }
}
