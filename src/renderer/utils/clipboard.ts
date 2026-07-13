/**
 * Copies text to clipboard with fallback for non-secure contexts (HTTP remote access).
 *
 * navigator.clipboard requires a secure context (HTTPS or localhost).
 * In web remote mode over HTTP, we fall back to the legacy execCommand approach.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }

  // Fallback: create a temporary textarea and use execCommand
  const el = document.createElement('textarea')
  el.value = text
  el.style.position = 'fixed'
  el.style.top = '0'
  el.style.left = '0'
  el.style.opacity = '0'
  el.style.pointerEvents = 'none'
  document.body.appendChild(el)
  el.focus()
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
}

/**
 * Polyfill navigator.clipboard.writeText for non-secure contexts (HTTP remote).
 *
 * Third-party libraries (e.g. Streamdown's Copy Code button) call
 * navigator.clipboard.writeText directly, which is undefined when the page is
 * served over plain HTTP. This polyfill installs a fallback so those libraries
 * work without modification. Safe to call multiple times — no-ops if the
 * Clipboard API is already available.
 */
export function installClipboardPolyfill(): void {
  if (typeof navigator === 'undefined') return
  if (navigator.clipboard?.writeText) return

  const fallback = (text: string): Promise<void> =>
    new Promise((resolve, reject) => {
      try {
        const el = document.createElement('textarea')
        el.value = text
        el.style.position = 'fixed'
        el.style.top = '0'
        el.style.left = '0'
        el.style.opacity = '0'
        el.style.pointerEvents = 'none'
        document.body.appendChild(el)
        el.focus()
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        resolve()
      } catch (err) {
        reject(err)
      }
    })

  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: fallback },
      writable: false,
      configurable: true,
    })
  } else {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: fallback,
      writable: false,
      configurable: true,
    })
  }
}
