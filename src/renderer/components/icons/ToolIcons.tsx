/**
 * ToolIcons - Centralized icon mapping using Lucide icons
 * Provides consistent, cross-platform icons for all UI elements
 */

import {
  FileText,
  FilePlus,
  FileEdit,
  Terminal,
  Search,
  FolderSearch,
  Globe,
  ListTodo,
  MessageSquare,
  Database,
  Braces,
  FileCode,
  FolderOpen,
  Folder,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  Lightbulb,
  Zap,
  Info,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  Bot,
  Hand,
  Settings,
  Plus,
  Trash2,
  ArrowLeft,
  Palette,
  Gamepad2,
  Wrench,
  Smartphone,
  Rocket,
  Star,
  FileJson,
  Image,
  Coffee,
  Gem,
  Apple,
  Package,
  Book,
  Cpu,
  HardDrive,
  Pencil,
  type LucideIcon
} from 'lucide-react'

// Icon theme registry
import { getIconTheme, type IconThemeDefinition } from '../../themes/file-icons'
import { useAppStore } from '../../stores/app.store'

// Tool name to icon mapping
export const toolIconMap: Record<string, LucideIcon> = {
  // File operations
  Read: FileText,
  Write: FilePlus,
  Edit: FileEdit,

  // Search operations
  Grep: Search,
  Glob: FolderSearch,

  // Execution
  Bash: Terminal,

  // Web
  WebFetch: Globe,
  WebSearch: Globe,

  // Task management
  TodoWrite: ListTodo,

  // Agent
  Task: Zap,

  // Notebook
  NotebookEdit: FileCode,

  // Other
  AskUserQuestion: MessageSquare,
}

// Get icon component for a tool
export function getToolIcon(toolName: string): LucideIcon {
  return toolIconMap[toolName] || Braces
}

// Status icons
export const StatusIcons = {
  pending: Clock,
  running: Loader2,
  success: CheckCircle2,
  error: XCircle,
  waiting_approval: AlertCircle,
} as const

// Thought type icons
export const ThoughtIcons = {
  thinking: Lightbulb,
  tool_use: Braces,
  tool_result: CheckCircle2,
  text: MessageSquare,
  system: Info,
  error: XCircle,
  result: Check,
} as const

// Re-export commonly used icons for convenience
export {
  Bot,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  Lightbulb,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Eye,
  EyeOff,
  Info,
  Terminal,
  FileText,
  FilePlus,
  FileEdit,
  Search,
  FolderSearch,
  Globe,
  ListTodo,
  MessageSquare,
  Zap,
  Braces,
}

// Icon wrapper component with consistent styling
interface ToolIconProps {
  name: string
  className?: string
  size?: number
}

export function ToolIcon({ name, className = '', size = 16 }: ToolIconProps) {
  const Icon = getToolIcon(name)
  return <Icon className={className} size={size} />
}

// Status icon component
interface StatusIconProps {
  status: 'pending' | 'running' | 'success' | 'error' | 'waiting_approval'
  className?: string
  size?: number
}

export function StatusIcon({ status, className = '', size = 16 }: StatusIconProps) {
  const Icon = StatusIcons[status]
  const isSpinning = status === 'running'

  return (
    <Icon
      className={`${className} ${isSpinning ? 'animate-spin' : ''}`}
      size={size}
    />
  )
}

// ============================================
// Space Icons with Colors
// ============================================

// Space icon identifiers (used in data storage)
export const SPACE_ICON_IDS = [
  'folder', 'code', 'globe', 'chart', 'file-text', 'palette',
  'gamepad', 'wrench', 'smartphone', 'lightbulb', 'rocket', 'star'
] as const

export type SpaceIconId = typeof SPACE_ICON_IDS[number]

// Map icon IDs to Lucide components
export const spaceIconMap: Record<string, LucideIcon> = {
  folder: Folder,
  code: FileCode,
  globe: Globe,
  chart: Database,
  'file-text': FileText,
  palette: Palette,
  gamepad: Gamepad2,
  wrench: Wrench,
  smartphone: Smartphone,
  lightbulb: Lightbulb,
  rocket: Rocket,
  star: Star,
  sparkles: Sparkles,
}

// Professional color palette for space icons
export const spaceIconColors: Record<string, string> = {
  folder: 'text-amber-500',        // Classic folder yellow
  code: 'text-blue-500',           // Tech/programming blue
  globe: 'text-cyan-500',          // Internet/global cyan
  chart: 'text-violet-500',        // Data/analytics purple
  'file-text': 'text-slate-500',   // Document neutral
  palette: 'text-pink-500',        // Design/art pink
  gamepad: 'text-emerald-500',     // Gaming green
  wrench: 'text-orange-500',       // Tools orange
  smartphone: 'text-indigo-500',   // Mobile tech
  lightbulb: 'text-yellow-500',    // Ideas/creativity
  rocket: 'text-rose-500',         // Launch/speed
  star: 'text-amber-400',          // Favorite/important
  sparkles: 'text-primary',        // Vortex brand color
}

// Space icon component with color
interface SpaceIconProps {
  iconId: SpaceIconId | string
  className?: string
  size?: number
  colored?: boolean  // Whether to apply default color
}

export function SpaceIcon({ iconId, className = '', size = 20, colored = true }: SpaceIconProps) {
  const Icon = spaceIconMap[iconId as SpaceIconId] || Folder
  const colorClass = colored ? (spaceIconColors[iconId] || 'text-muted-foreground') : ''
  return <Icon className={`${colorClass} ${className}`} size={size} />
}

// File icon component with color
interface FileIconProps {
  extension: string
  isFolder?: boolean
  isOpen?: boolean  // For folders: show open/closed state
  className?: string
  size?: number
  colored?: boolean
}

export function FileIcon({ extension, isFolder = false, isOpen = false, className = '', size = 16, colored = true }: FileIconProps) {
  const config = useAppStore(s => s.config)
  const iconTheme = getIconTheme(config?.appearance?.iconTheme || 'material-icon-theme')

  const colorClass = colored
    ? isFolder
      ? iconTheme.folderColor
      : (iconTheme.fileIconColors[extension.toLowerCase().replace('.', '')] || iconTheme.defaultColor)
    : ''

  if (isFolder) {
    const FolderIcon = isOpen ? iconTheme.folderOpenIcon : iconTheme.folderIcon
    return <FolderIcon className={`${colorClass} ${className}`} size={size} />
  }
  const ext = extension.toLowerCase().replace('.', '')
  const Icon = iconTheme.fileIconMap[ext] || iconTheme.defaultIcon
  return <Icon className={`${colorClass} ${className}`} size={size} />
}

// ============================================
// UI Icons (commonly used throughout app)
// ============================================

export const UIIcons = {
  sparkles: Sparkles,
  hand: Hand,
  settings: Settings,
  plus: Plus,
  trash: Trash2,
  arrowLeft: ArrowLeft,
  folder: Folder,
  folderOpen: FolderOpen,
  messageSquare: MessageSquare,
  check: Check,
  checkCircle: CheckCircle2,
  xCircle: XCircle,
  alertCircle: AlertCircle,
  lightbulb: Lightbulb,
} as const

// Re-export additional icons
export {
  Sparkles,
  Hand,
  Settings,
  Plus,
  Trash2,
  ArrowLeft,
  Folder,
  FolderOpen,
  Palette,
  Gamepad2,
  Wrench,
  Smartphone,
  Rocket,
  Star,
  FileJson,
  Image,
  Coffee,
  Gem,
  Apple,
  Package,
  Book,
  Cpu,
  HardDrive,
  Pencil,
}
