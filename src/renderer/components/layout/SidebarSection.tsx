import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface SidebarSectionProps {
  title: string
  icon?: ReactNode
  defaultExpanded?: boolean
  badge?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  onToggle?: (expanded: boolean) => void
  /** When false, renders nothing (useful for conditional sections) */
  visible?: boolean
}

export function SidebarSection({
  title,
  icon,
  defaultExpanded = true,
  badge,
  actions,
  children,
  className,
  contentClassName,
  onToggle,
  visible = true,
}: SidebarSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const handleToggle = () => {
    const next = !expanded
    setExpanded(next)
    onToggle?.(next)
  }

  if (!visible) return null

  return (
    <div className={`border-t border-border ${className ?? ''}`}>
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors"
      >
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span className="text-sm sm:text-[14px] font-semibold tracking-wide text-muted-foreground flex-1 text-left">
          {title}
        </span>
        {badge && <span className="text-xs text-muted-foreground">{badge}</span>}
        {actions && <span onClick={(e) => e.stopPropagation()}>{actions}</span>}
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
      </button>
      {expanded && <div className={contentClassName}>{children}</div>}
    </div>
  )
}
