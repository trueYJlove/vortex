/**
 * HaloLogo - Brand animated logo component
 * Used across the app for loading states and branding
 *
 * Usage:
 *   <HaloLogo size="sm" />      // 28px - for inline/small areas
 *   <HaloLogo size="md" />      // 48px - for medium contexts
 *   <HaloLogo size="lg" />      // 96px - for large displays (like splash)
 *   <HaloLogo size={64} />      // custom size in pixels
 */

interface HaloLogoProps {
  /** Size preset or custom pixel value */
  size?: 'sm' | 'md' | 'lg' | number
  /** Optional additional class names */
  className?: string
}

// Size presets in pixels
const SIZE_PRESETS = {
  sm: 28,
  md: 48,
  lg: 96
} as const

// Scale-dependent styles based on size
function getScaledStyles(size: number) {
  // Base reference is 96px (lg size)
  const scale = size / 96

  return {
    // Blur scales with size
    blur: size <= 32 ? 'blur-sm' : size <= 56 ? 'blur-md' : 'blur-xl',
    // Border width scales with size
    border: size <= 32 ? 'border-2' : size <= 56 ? 'border-[3px]' : 'border-4',
    // Inner glow inset scales with size
    inset: size <= 32 ? 'inset-0.5' : size <= 56 ? 'inset-1' : 'inset-2',
    // SVG stroke width (thicker at small sizes for visibility)
    strokeWidth: size <= 32 ? 4 : size <= 56 ? 3.5 : 3
  }
}

export function HaloLogo({ size = 'md', className = '' }: HaloLogoProps) {
  const pixelSize = typeof size === 'number' ? size : SIZE_PRESETS[size]
  const styles = getScaledStyles(pixelSize)

  return (
    <div
      className={`relative ${className}`}
      style={{ width: pixelSize, height: pixelSize }}
    >
      {/* Outer glow ring - purple tint */}
      <div className={`absolute inset-0 rounded-full bg-[#8b5cf6]/20 ${styles.blur} halo-breathe`} />

      {/* Main ring */}
      <div
        className={`relative rounded-full ${styles.border} border-[#8b5cf6]/60 flex items-center justify-center halo-glow`}
        style={{ width: pixelSize, height: pixelSize }}
      >
        {/* Inner glow - blue to purple gradient */}
        <div className={`absolute ${styles.inset} rounded-full bg-gradient-to-br from-primary/30 via-[#8b5cf6]/20 to-transparent`} />

        {/* Animated ring segment - blue to purple gradient arc */}
        <svg
          className="absolute inset-0 w-full h-full -rotate-90"
          viewBox="0 0 100 100"
        >
          <defs>
            <linearGradient id="vortex-arc-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6"/>
              <stop offset="100%" stopColor="#8b5cf6"/>
            </linearGradient>
          </defs>
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="url(#vortex-arc-grad)"
            strokeWidth={styles.strokeWidth}
            strokeLinecap="round"
            strokeDasharray="70 200"
            className="halo-spin"
            style={{ transformOrigin: 'center' }}
          />
        </svg>
      </div>
    </div>
  )
}
