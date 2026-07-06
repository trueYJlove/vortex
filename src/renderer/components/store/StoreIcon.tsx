/**
 * Store Icon
 *
 * Renders a store entry's icon. URLs are rendered as <img>,
 * emoji/text icons are rendered as <span>.
 */

import { useState } from 'react'

interface StoreIconProps {
  icon?: string
  className?: string
}

function isUrl(icon: string): boolean {
  return /^https?:\/\//i.test(icon)
}

/** Check if the string contains at least one emoji presentation character. */
function hasEmoji(str: string): boolean {
  return /\p{Emoji_Presentation}/u.test(str)
}

/**
 * Determine if the icon should be rendered.
 * - URLs → rendered as <img> (handled by caller)
 * - Emoji → rendered as <span>
 * - Plain text like category labels ("social", "new") → not rendered
 */
function shouldRender(icon: string): boolean {
  if (isUrl(icon)) return true
  return hasEmoji(icon)
}

export function StoreIcon({ icon, className }: StoreIconProps) {
  const [imgFailed, setImgFailed] = useState(false)

  if (!icon) return null

  if (isUrl(icon) && !imgFailed) {
    return (
      <img
        src={icon}
        alt=""
        className={className}
        onError={() => setImgFailed(true)}
      />
    )
  }

  if (!shouldRender(icon)) return null

  return <span className={className}>{icon}</span>
}
