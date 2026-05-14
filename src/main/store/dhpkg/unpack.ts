import { unzipSync, strFromU8 } from 'fflate'
import { parse as parseYaml } from 'yaml'
import { AppSpecSchema, type AppSpec } from '../../apps/spec'

/** Hard cap on archive size we are willing to unpack. */
export const MAX_UNPACK_BYTES = 50 * 1024 * 1024

export interface UnpackResult {
  spec: AppSpec
  files: Record<string, Buffer>
}

/**
 * Extract and validate a `.dhpkg` archive.
 *
 * Throws if the archive is too large, missing `spec.yaml`, contains an
 * unsafe entry path (zip-slip), or the embedded spec fails Zod validation.
 */
export async function unpack(buffer: Buffer | Uint8Array): Promise<UnpackResult> {
  const bytes = buffer instanceof Buffer ? buffer : Buffer.from(buffer)
  if (bytes.byteLength > MAX_UNPACK_BYTES) {
    throw new Error(
      `[dhpkg/unpack] Archive too large: ${bytes.byteLength} bytes (max ${MAX_UNPACK_BYTES})`
    )
  }

  const entries = unzipSync(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))

  const specRaw = entries['spec.yaml']
  if (!specRaw) {
    throw new Error('[dhpkg/unpack] Archive is missing spec.yaml — not a valid .dhpkg')
  }

  let spec: AppSpec
  try {
    const yamlText = strFromU8(specRaw)
    const parsed = parseYaml(yamlText)
    spec = AppSpecSchema.parse(parsed)
  } catch (err) {
    throw new Error(
      `[dhpkg/unpack] Invalid spec.yaml: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  const files: Record<string, Buffer> = {}
  for (const [path, data] of Object.entries(entries)) {
    if (path === 'spec.yaml') continue
    if (path.includes('..') || path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path)) {
      throw new Error(`[dhpkg/unpack] Refusing unsafe archive entry: "${path}"`)
    }
    files[path] = Buffer.from(data)
  }

  console.log(
    `[dhpkg/unpack] Unpacked "${spec.name}" v${spec.version ?? '0.0.0'}: ` +
    `${Object.keys(files).length} files`
  )

  return { spec, files }
}
