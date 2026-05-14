/**
 * Publish dispatcher that writes the packed `.dhpkg` to a user-chosen path
 * via the system save dialog. Also reused by the `store:export-dhpkg` IPC.
 */

import { dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { pack } from '../../dhpkg'
import type { AppSpec } from '../../../apps/spec'
import type { PublishContext, PublishResult } from '../types'

export async function dispatch(
  spec: AppSpec,
  files: Record<string, string | Buffer>,
  ctx: PublishContext,
  _config: Record<string, unknown>,
): Promise<PublishResult> {
  const safeName = (spec.store?.slug ?? spec.name).replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  const defaultName = `${safeName}-${spec.version ?? '0.0.0'}.dhpkg`

  const result = await dialog.showSaveDialog({
    title: 'Export as .dhpkg',
    defaultPath: defaultName,
    filters: [{ name: 'DHP Package', extensions: ['dhpkg'] }],
  })

  if (result.canceled || !result.filePath) {
    return {
      status: 'cancelled',
      target: 'local-dhpkg',
      details: 'User cancelled the save dialog',
    }
  }

  const buf = await pack(spec, files)
  await writeFile(result.filePath, buf)

  console.log(`[publish/local-dhpkg] Wrote ${result.filePath} (${buf.byteLength} bytes)`)
  void ctx
  return {
    status: 'success',
    target: 'local-dhpkg',
    details: `Saved .dhpkg to ${result.filePath}`,
    stagingPath: result.filePath,
  }
}
