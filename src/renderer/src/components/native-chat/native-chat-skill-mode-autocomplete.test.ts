import { describe, expect, it } from 'vitest'
import type { DiscoveredSkill } from '../../../../shared/skills'
import { getNativeChatAgentProfile } from '../../../../shared/native-chat-agent-profiles'
import { deriveComposerAutocomplete, applyPickerSuggestion } from './native-chat-composer-state'

const skill: DiscoveredSkill = {
  id: 'loop',
  name: 'loop-design',
  description: 'Design loops',
  providers: ['codex'],
  sourceKind: 'repo',
  sourceLabel: 'Project',
  rootPath: '/repo',
  directoryPath: '/repo/loop',
  skillFilePath: '/repo/loop/SKILL.md',
  installed: true,
  updatedAt: null,
  promptModes: [
    { value: 'plan', description: 'Plan the loop' },
    { value: 'run', description: 'Run the loop' }
  ]
}
const profile = getNativeChatAgentProfile('codex')
const derive = (
  draft: string,
  caret = draft.length,
  skills = [skill],
  dismissed: string | null = null
) =>
  deriveComposerAutocomplete(
    draft,
    caret,
    [],
    skills,
    profile,
    { status: 'ready', skills },
    dismissed
  )

describe('skill mode autocomplete', () => {
  it('offers documented modes after typed skill and after partial mode, preserving draft suffix', () => {
    const draft = 'Please $loop-design  keep this task'
    const caret = 'Please $loop-design '.length
    const result = derive(draft, caret)
    expect(result.mode).toBe('slash')
    if (result.mode !== 'slash') {
      throw new Error('Expected modes')
    }
    expect(result.dispatchable).toBe(false)
    expect(result.items.map((item) => item.token)).toEqual(['plan', 'run'])
    expect(applyPickerSuggestion(draft, caret, result.items[0]).draft).toBe(
      'Please $loop-design plan keep this task'
    )
    const partial = derive('$loop-design r')
    expect(partial.mode === 'slash' && partial.items.map((item) => item.token)).toEqual(['run'])
  })
  it('honours Escape, existing arguments, no-mode/older hosts, and conflicting duplicate sources', () => {
    expect(derive('$loop-design ', undefined, [skill], 'skill-mode:0').mode).toBe('none')
    expect(derive('$loop-design run').mode).toBe('none')
    expect(derive('$loop-design run task').mode).toBe('none')
    expect(derive('$loop-design ', undefined, [{ ...skill, promptModes: undefined }]).mode).toBe(
      'none'
    )
    expect(
      derive('$loop-design ', undefined, [skill, { ...skill, id: 'second', promptModes: [] }]).mode
    ).toBe('none')
  })
  it('respects the session skill catalog and actual skill sigil', () => {
    const draft = '$loop-design '
    const discover = { status: 'ready' as const, skills: [skill] }
    expect(
      deriveComposerAutocomplete(draft, draft.length, [], [skill], profile, discover, null, []).mode
    ).toBe('none')
    expect(
      deriveComposerAutocomplete(draft, draft.length, [], [skill], profile, discover, null, [
        { name: 'loop-design', description: 'Loaded skill' }
      ]).mode
    ).toBe('slash')
    expect(derive('/loop-design ').mode).toBe('none')
    const claude = getNativeChatAgentProfile('claude')
    const slash = '/loop-design '
    expect(
      deriveComposerAutocomplete(
        slash,
        slash.length,
        [{ name: 'loop-design' }],
        [skill],
        claude,
        discover
      ).mode
    ).toBe('none')
  })
  it('recognizes the last skill token and replaces a partial argument at its caret', () => {
    const draft = '$other $loop-design pln task'
    const result = derive(draft, '$other $loop-design pl'.length)
    if (result.mode !== 'slash') {
      throw new Error('Expected modes')
    }
    expect(
      applyPickerSuggestion(draft, '$other $loop-design pl'.length, result.items[0]).draft
    ).toBe('$other $loop-design plan task')
  })
})
