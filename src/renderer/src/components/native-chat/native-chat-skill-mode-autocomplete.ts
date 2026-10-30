import type { DiscoveredSkill } from '../../../../shared/skills'
import type { NativeChatAgentProfile } from '../../../../shared/native-chat-agent-profiles'
import type { ComposerAutocomplete } from './native-chat-composer-state'
import { buildNativeChatPickerItems } from '../../../../shared/native-chat-picker-items'
import type {
  NativeChatSessionSkill,
  SlashCommandSuggestion
} from '../../../../shared/native-chat-slash-commands'

export function deriveSkillModeAutocomplete(
  before: string,
  skills: readonly DiscoveredSkill[],
  profile: NativeChatAgentProfile | null,
  dismissedTriggerKey: string | null,
  commands: readonly SlashCommandSuggestion[] = [],
  sessionSkills?: readonly NativeChatSessionSkill[]
): ComposerAutocomplete | null {
  if (!profile) {
    return null
  }
  const match = /(?:^|\s)([$/])([\w:-]+)([ \t]+)([\w-]*)$/.exec(before)
  if (!match || (match[1] === '$' && profile.skillPrefix !== '$')) {
    return null
  }
  const skillName = match[2]
  const prefix = profile.skillNamePrefix ?? ''
  const catalog = buildNativeChatPickerItems(
    commands,
    skills.map((skill) => ({ ...skill, name: `${prefix}${skill.name}` })),
    '',
    profile.skillPrefix,
    sessionSkills,
    Infinity,
    match[1] === '$' ? '$' : '/'
  )
  const eligible = catalog.find(
    (item) => item.kind === 'skill' && item.token === `${match[1]}${skillName}`
  )
  if (
    !eligible ||
    eligible.kind !== 'skill' ||
    (match[1] === '/' && catalog.some((item) => item.kind === 'command' && item.name === skillName))
  ) {
    return null
  }
  const matching = skills.filter((skill) =>
    eligible.sources.some((source) => source.skillFilePath === skill.skillFilePath)
  )
  const [source] = matching
  if (!source?.promptModes?.length) {
    return null
  }
  // Duplicate names can resolve differently in the agent; offer only choices each source documents.
  const modes = source.promptModes.filter((mode) =>
    matching.every((skill) =>
      skill.promptModes?.some((candidate) => candidate.value === mode.value)
    )
  )
  const query = match[4].toLowerCase()
  if (query && modes.some((mode) => mode.value === query)) {
    return null
  }
  const argumentStart = before.length - match[4].length
  const skillStart = argumentStart - match[3].length - skillName.length - 1
  const triggerKey = `skill-mode:${skillStart}`
  if (dismissedTriggerKey === triggerKey) {
    return { mode: 'none' }
  }
  const items = modes
    .filter((mode) => mode.value.startsWith(query))
    .map((mode) => ({
      kind: 'skill-mode' as const,
      id: `skill-mode:${skillStart}:${mode.value}`,
      name: mode.value,
      token: mode.value,
      description: mode.description,
      argumentStart
    }))
  if (!items.length) {
    return null
  }
  return {
    mode: 'slash',
    query,
    items,
    triggerKey,
    prefix: match[1] === '$' ? '$' : '/',
    dispatchable: false,
    grouped: false,
    commandsEnabled: false,
    skillsEnabled: false,
    skillStatus: 'ready'
  }
}

export function isSkillModeTrigger(before: string): boolean {
  return /(?:^|\s)[$/][\w:-]+[ \t]+[\w-]*$/.test(before)
}
