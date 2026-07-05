import type { LucideIcon } from 'lucide-react'

export interface IconThemeDefinition {
  id: string
  name: string
  description: string
  fileIconMap: Record<string, LucideIcon>
  fileIconColors: Record<string, string>
  folderIcon: LucideIcon
  folderOpenIcon: LucideIcon
  defaultIcon: LucideIcon
  defaultColor: string
  folderColor: string
}
