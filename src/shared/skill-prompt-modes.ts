import { stripUnsafeDisplayCharacters } from './skill-display-text'

export type SkillPromptMode = { value: string; description: string }

const MODE_SECTION = /\b(mode|modes|operation|operations|backend|backends|invocation|usage)\b/i

/** Only documented choice labels and literal invocation prefixes become suggestions. */
export function extractSkillPromptModes(markdown: string, skillName: string): SkillPromptMode[] {
  const modes = new Map<string, SkillPromptMode>()
  const add = (value: string, description: string): void => {
    if (stripUnsafeDisplayCharacters(value) !== value) {
      return
    }
    const clean = value.replace(/[`*]/g, '').trim().toLowerCase()
    if (!/^[a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*){0,4}$/.test(clean) || clean.length > 60) {
      return
    }
    if (!modes.has(clean) && modes.size < 16) {
      modes.set(clean, {
        value: clean,
        description: stripUnsafeDisplayCharacters(description).replace(/[*`]/g, '').slice(0, 200)
      })
    }
  }
  let section = false
  let fence = false
  for (const line of markdown.slice(0, 256 * 1024).split(/\r?\n/)) {
    if (line.startsWith('```')) {
      fence = !fence
      continue
    }
    const heading = /^#{1,6}\s+(.+)/.exec(line)
    if (heading) {
      section = MODE_SECTION.test(heading[1])
    }
    if (!fence && section) {
      const choice = /^\s*(?:[-*]|\d+\.)\s+\*\*([^*]+)\*\*[:\s]*(?:[—–-]\s*)?(.*)/.exec(line)
      if (choice) {
        const label = choice[1].replace(/\s*\([^)]*\)/g, '').replace(/:$/, '')
        for (const value of label.split(/\s+or\s+/i)) {
          add(value, choice[2])
        }
      }
    }
    // Invocation examples give a literal prefix, while placeholders remain the user's task.
    if (fence || /`\$/.test(line)) {
      for (const invocation of line.matchAll(/\$([\w:-]+)\s+([a-z][a-z-]*)(?=[\s`])/g)) {
        if (invocation[1] === skillName) {
          add(invocation[2], `Documented $${skillName} ${invocation[2]} invocation`)
        }
      }
    }
    for (const mode of line.matchAll(
      /(?:normal|optional|default)\s+\*\*`?([a-z][a-z-]*)`?\*\*(?:\s+mode)?/gi
    )) {
      add(mode[1], line.trim())
    }
  }
  return [...modes.values()]
}
