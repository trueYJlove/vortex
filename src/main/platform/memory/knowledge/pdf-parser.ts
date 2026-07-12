/**
 * PDF text parser wrapper.
 *
 * Extracts plain text content from PDF file buffers using pdf-parse v2.
 *
 * pdfjs-dist v5 tries to load @napi-rs/canvas via createRequire to polyfill
 * DOMMatrix/ImageData/Path2D. In Electron's ESM build, the native module
 * fails to load (ABI mismatch), leaving those globals undefined. For text
 * extraction we provide lightweight stubs — no canvas rendering needed.
 */

let initialized = false

function ensureInit() {
  if (initialized) return
  initialized = true

  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(_init?: string | number[]) {}
      translateSelf() { return this }
      scaleSelf() { return this }
      multiplySelf() { return this }
      inverse() { return this }
    } as any
  }
  if (!globalThis.ImageData) {
    globalThis.ImageData = class ImageData {
      width: number
      height: number
      data: Uint8ClampedArray
      constructor(dataOrWidth: Uint8ClampedArray | number, height?: number) {
        if (typeof dataOrWidth === 'number') {
          this.width = dataOrWidth
          this.height = height!
          this.data = new Uint8ClampedArray(this.width * this.height * 4)
        } else {
          this.data = dataOrWidth
          this.width = 0
          this.height = 0
        }
      }
    } as any
  }
  if (!globalThis.Path2D) {
    globalThis.Path2D = class Path2D {
      constructor(_d?: string) {}
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      rect() {}
    } as any
  }
  if (!globalThis.navigator) {
    globalThis.navigator = { language: 'en-US', platform: '', userAgent: '' } as any
  }
}

export async function parsePdf(buffer: Buffer): Promise<string> {
  ensureInit()

  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  const textResult = await parser.getText()
  return textResult.text
}