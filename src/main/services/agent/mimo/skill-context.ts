import path from 'path'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { resolveClaudeConfigDir } from '../../../foundation/config.service'

export function getMimoInstalledSkills(): string[] {
  try {
    const configDir = resolveClaudeConfigDir()
    const skillsDir = path.join(configDir, 'skills')
    if (!existsSync(skillsDir)) return []

    return readdirSync(skillsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    return []
  }
}

export function getMimoSkillContent(skillName: string): string | null {
  try {
    const configDir = resolveClaudeConfigDir()
    const skillPath = path.join(configDir, 'skills', skillName, 'SKILL.md')
    if (!existsSync(skillPath)) return null
    return readFileSync(skillPath, 'utf-8')
  } catch {
    return null
  }
}
