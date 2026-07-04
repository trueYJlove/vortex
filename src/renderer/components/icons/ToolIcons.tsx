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

// Material Icon Theme style icons from react-icons/si
import {
  SiTypescript,
  SiJavascript,
  SiReact,
  SiPython,
  SiRust,
  SiGo,
  SiKotlin,
  SiSwift,
  SiRuby,
  SiPhp,
  SiHaskell,
  SiElixir,
  SiScala,
  SiNodedotjs,
  SiJson,
  SiHtml5,
  SiCss,
  SiSass,
  SiMarkdown,
  SiDocker,
  SiGit,
  SiNpm,
  SiWebpack,
  SiVite,
  SiBabel,
  SiEslint,
  SiPrettier,
  SiJest,
  SiMocha,
  SiCypress,
  SiMongodb,
  SiPostgresql,
  SiMysql,
  SiSqlite,
  SiRedis,
  SiNginx,
  SiApache,
  SiLinux,
  SiUbuntu,
  SiApple,
  SiSublimetext,
  SiVim,
  SiNeovim,
  SiObsidian,
  SiNotion,
  SiFigma,
  SiBlender,
  SiUnrealengine,
  SiUnity,
  SiGodotengine,
  SiCplusplus,
  SiC,
  SiSharp,
  SiSpring,
  SiYaml,
  SiXml,
  SiVuedotjs,
  SiSvelte,
  SiAngular,
  SiExpress,
  SiNestjs,
  SiFastify,
  SiSvg
} from 'react-icons/si'

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
  sparkles: 'text-primary',        // Halo brand color
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

// ============================================
// File Type Icons (Material Icon Theme style)
// ============================================

// File extension to icon mapping
export const fileIconMap: Record<string, LucideIcon> = {
  // Web
  html: SiHtml5 as unknown as LucideIcon,
  htm: SiHtml5 as unknown as LucideIcon,
  css: SiCss as unknown as LucideIcon,
  scss: SiSass as unknown as LucideIcon,
  less: SiSass as unknown as LucideIcon,
  // JavaScript/TypeScript
  js: SiJavascript as unknown as LucideIcon,
  jsx: SiReact as unknown as LucideIcon,
  ts: SiTypescript as unknown as LucideIcon,
  tsx: SiReact as unknown as LucideIcon,
  // Data
  json: SiJson as unknown as LucideIcon,
  // Documentation
  md: SiMarkdown as unknown as LucideIcon,
  markdown: SiMarkdown as unknown as LucideIcon,
  txt: FileText,
  // Python
  py: SiPython as unknown as LucideIcon,
  // Rust
  rs: SiRust as unknown as LucideIcon,
  // Go
  go: SiGo as unknown as LucideIcon,
  // Java
  java: SiSpring as unknown as LucideIcon,
  // C/C++
  cpp: SiCplusplus as unknown as LucideIcon,
  c: SiC as unknown as LucideIcon,
  h: SiC as unknown as LucideIcon,
  hpp: SiCplusplus as unknown as LucideIcon,
  // Ruby
  rb: SiRuby as unknown as LucideIcon,
  // Swift
  swift: SiSwift as unknown as LucideIcon,
  // Kotlin
  kt: SiKotlin as unknown as LucideIcon,
  kts: SiKotlin as unknown as LucideIcon,
  // PHP
  php: SiPhp as unknown as LucideIcon,
  // Haskell
  hs: SiHaskell as unknown as LucideIcon,
  // Elixir
  ex: SiElixir as unknown as LucideIcon,
  exs: SiElixir as unknown as LucideIcon,
  // Scala
  scala: SiScala as unknown as LucideIcon,
  // SQL
  sql: SiSqlite as unknown as LucideIcon,
  // Shell
  sh: Terminal,
  bash: Terminal,
  zsh: Terminal,
  // Config
  yaml: SiYaml as unknown as LucideIcon,
  yml: SiYaml as unknown as LucideIcon,
  xml: SiXml as unknown as LucideIcon,
  // Docker
  dockerfile: SiDocker as unknown as LucideIcon,
  dockerignore: SiDocker as unknown as LucideIcon,
  // Git
  gitignore: SiGit as unknown as LucideIcon,
  // Node.js
  node: SiNodedotjs as unknown as LucideIcon,
  // Package managers
  package: SiNpm as unknown as LucideIcon,
  lock: SiNpm as unknown as LucideIcon,
  // Build tools
  webpack: SiWebpack as unknown as LucideIcon,
  vite: SiVite as unknown as LucideIcon,
  babel: SiBabel as unknown as LucideIcon,
  // Linting/Formatting
  eslint: SiEslint as unknown as LucideIcon,
  prettier: SiPrettier as unknown as LucideIcon,
  // Testing
  jest: SiJest as unknown as LucideIcon,
  mocha: SiMocha as unknown as LucideIcon,
  cypress: SiCypress as unknown as LucideIcon,
  // Frontend frameworks
  vue: SiVuedotjs as unknown as LucideIcon,
  svelte: SiSvelte as unknown as LucideIcon,
  angular: SiAngular as unknown as LucideIcon,
  // Backend frameworks
  express: SiExpress as unknown as LucideIcon,
  nest: SiNestjs as unknown as LucideIcon,
  fastify: SiFastify as unknown as LucideIcon,
  // Databases
  mongodb: SiMongodb as unknown as LucideIcon,
  postgresql: SiPostgresql as unknown as LucideIcon,
  mysql: SiMysql as unknown as LucideIcon,
  sqlite: SiSqlite as unknown as LucideIcon,
  redis: SiRedis as unknown as LucideIcon,
  // DevOps
  nginx: SiNginx as unknown as LucideIcon,
  apache: SiApache as unknown as LucideIcon,
  linux: SiLinux as unknown as LucideIcon,
  ubuntu: SiUbuntu as unknown as LucideIcon,
  // Platforms
  apple: SiApple as unknown as LucideIcon,
  windows: Braces as unknown as LucideIcon,
  // IDEs/Editors
  vscode: Braces as unknown as LucideIcon,
  sublime: SiSublimetext as unknown as LucideIcon,
  vim: SiVim as unknown as LucideIcon,
  neovim: SiNeovim as unknown as LucideIcon,
  // Notes
  obsidian: SiObsidian as unknown as LucideIcon,
  notion: SiNotion as unknown as LucideIcon,
  // Design
  figma: SiFigma as unknown as LucideIcon,
  photoshop: Pencil as unknown as LucideIcon,
  illustrator: Pencil as unknown as LucideIcon,
  premiere: Pencil as unknown as LucideIcon,
  // 3D/Game
  blender: SiBlender as unknown as LucideIcon,
  unreal: SiUnrealengine as unknown as LucideIcon,
  unity: SiUnity as unknown as LucideIcon,
  godot: SiGodotengine as unknown as LucideIcon,
  // Images
  svg: SiSvg as unknown as LucideIcon,
  png: Image,
  jpg: Image,
  jpeg: Image,
  gif: Image,
  webp: Image,
  ico: Image,
  // Documents
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  xls: Database,
  xlsx: Database,
  // Archives
  zip: Package,
  tar: Package,
  gz: Package,
  rar: Package,
  // Default
  default: FileText,
}

// Get file icon by extension
export function getFileTypeIcon(extension: string): LucideIcon {
  const ext = extension.toLowerCase().replace('.', '')
  return fileIconMap[ext] || fileIconMap.default
}

// Professional color palette for file types (Material Icon Theme style)
export const fileIconColors: Record<string, string> = {
  // Web - official brand colors
  html: 'text-orange-500',         // HTML5 orange
  htm: 'text-orange-500',
  css: 'text-blue-500',            // CSS3 blue
  scss: 'text-pink-500',           // Sass pink
  less: 'text-indigo-500',
  // JavaScript/TypeScript
  js: 'text-yellow-500',           // JS yellow
  jsx: 'text-cyan-400',            // React cyan
  ts: 'text-blue-600',             // TypeScript blue
  tsx: 'text-blue-500',            // React + TS
  // Data
  json: 'text-emerald-500',        // Data green
  // Documentation
  md: 'text-slate-500',            // Markdown neutral
  markdown: 'text-slate-500',
  txt: 'text-gray-500',
  // Python
  py: 'text-sky-500',              // Python blue
  // Rust
  rs: 'text-orange-600',           // Rust orange
  // Go
  go: 'text-cyan-500',             // Go cyan
  // Java
  java: 'text-red-500',            // Java red
  // C/C++
  cpp: 'text-blue-700',
  c: 'text-blue-600',
  h: 'text-violet-500',
  hpp: 'text-violet-600',
  // Ruby
  rb: 'text-red-600',              // Ruby red
  // Swift
  swift: 'text-orange-500',        // Swift orange
  // Kotlin
  kt: 'text-purple-500',           // Kotlin purple
  kts: 'text-purple-500',
  // PHP
  php: 'text-indigo-500',          // PHP indigo
  // Haskell
  hs: 'text-purple-600',           // Haskell purple
  // Elixir
  ex: 'text-violet-500',           // Elixir violet
  exs: 'text-violet-500',
  // Scala
  scala: 'text-red-500',           // Scala red
  // SQL
  sql: 'text-amber-600',           // Database amber
  // Shell
  sh: 'text-green-600',            // Terminal green
  bash: 'text-green-600',
  zsh: 'text-green-500',
  // Config
  yaml: 'text-red-400',
  yml: 'text-red-400',
  xml: 'text-orange-400',
  // Docker
  dockerfile: 'text-blue-500',     // Docker blue
  dockerignore: 'text-blue-500',
  // Git
  gitignore: 'text-orange-500',    // Git orange
  // Node.js
  node: 'text-green-500',          // Node.js green
  // Package managers
  package: 'text-red-500',         // npm red
  lock: 'text-red-500',
  // Build tools
  webpack: 'text-blue-500',        // Webpack blue
  vite: 'text-purple-500',         // Vite purple
  babel: 'text-yellow-500',        // Babel yellow
  // Linting/Formatting
  eslint: 'text-purple-500',       // ESLint purple
  prettier: 'text-pink-500',       // Prettier pink
  // Testing
  jest: 'text-red-500',            // Jest red
  mocha: 'text-red-500',           // Mocha red
  cypress: 'text-green-500',       // Cypress green
  // Frontend frameworks
  vue: 'text-green-500',           // Vue green
  svelte: 'text-orange-500',       // Svelte orange
  angular: 'text-red-500',         // Angular red
  // Backend frameworks
  express: 'text-gray-500',        // Express gray
  nest: 'text-red-500',            // NestJS red
  fastify: 'text-green-500',       // Fastify green
  // Databases
  mongodb: 'text-green-500',       // MongoDB green
  postgresql: 'text-blue-500',     // PostgreSQL blue
  mysql: 'text-blue-600',          // MySQL blue
  sqlite: 'text-blue-500',         // SQLite blue
  redis: 'text-red-500',           // Redis red
  // DevOps
  nginx: 'text-green-500',         // Nginx green
  apache: 'text-red-500',          // Apache red
  linux: 'text-yellow-500',        // Linux yellow
  ubuntu: 'text-orange-500',       // Ubuntu orange
  // Platforms
  apple: 'text-gray-500',          // Apple gray
  windows: 'text-blue-500',        // Windows blue
  // IDEs/Editors
  vscode: 'text-blue-500',         // VS Code blue
  sublime: 'text-orange-500',      // Sublime orange
  vim: 'text-green-500',           // Vim green
  neovim: 'text-green-500',        // Neovim green
  // Notes
  obsidian: 'text-purple-500',     // Obsidian purple
  notion: 'text-gray-500',         // Notion gray
  // Design
  figma: 'text-pink-500',          // Figma pink
  photoshop: 'text-blue-600',      // Photoshop blue
  illustrator: 'text-orange-500',  // Illustrator orange
  premiere: 'text-purple-500',     // Premiere purple
  // 3D/Game
  blender: 'text-orange-500',      // Blender orange
  unreal: 'text-blue-500',         // Unreal blue
  unity: 'text-gray-500',          // Unity gray
  godot: 'text-blue-500',          // Godot blue
  // Images
  svg: 'text-amber-500',
  png: 'text-pink-500',
  jpg: 'text-pink-500',
  jpeg: 'text-pink-500',
  gif: 'text-purple-500',
  webp: 'text-indigo-500',
  ico: 'text-blue-400',
  // Documents
  pdf: 'text-red-500',             // PDF red
  doc: 'text-blue-600',            // Word blue
  docx: 'text-blue-600',
  xls: 'text-green-600',           // Excel green
  xlsx: 'text-green-600',
  // Archives
  zip: 'text-amber-600',
  tar: 'text-amber-600',
  gz: 'text-amber-500',
  rar: 'text-purple-600',
  // Default
  default: 'text-slate-500',
  // Folder
  folder: 'text-amber-500',        // Classic folder yellow
}

// Get file icon color
export function getFileIconColor(extension: string, isFolder: boolean = false): string {
  if (isFolder) return fileIconColors.folder
  const ext = extension.toLowerCase().replace('.', '')
  return fileIconColors[ext] || fileIconColors.default
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
  const colorClass = colored ? getFileIconColor(extension, isFolder) : ''

  if (isFolder) {
    const FolderIcon = isOpen ? FolderOpen : Folder
    return <FolderIcon className={`${colorClass} ${className}`} size={size} />
  }
  const Icon = getFileTypeIcon(extension)
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
