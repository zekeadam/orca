import { describe, expect, it } from 'vitest'
import { extractSkillPromptModes } from './skill-prompt-modes'

describe('documented skill prompt modes', () => {
  it('finds Smart Execution backend and coverage modes, without inventing placeholders', () => {
    const source =
      '# Smart Execution\n## Choose the execution backend\n' +
      '- **Native:** a small team.\n- **Orca:** durable coordination.\n' +
      '- **Auto (default):** chooses the backend.\n' +
      'In normal **pool** mode, choose useful members. Optional **`all`** requires coverage.\n' +
      '```text\n$smart-execution <task>\n$smart-execution gpt claude <task>\n```'
    expect(extractSkillPromptModes(source, 'smart-execution').map((mode) => mode.value)).toEqual([
      'native',
      'orca',
      'auto',
      'pool',
      'all',
      'gpt'
    ])
  })
  it('finds Loop Design operations and Ask literal handoff invocation', () => {
    expect(
      extractSkillPromptModes(
        '## Choose the requested operation\n' +
          '- **Plan or revise** is the default.\n- **Critique** assesses a loop.\n' +
          '- **Run or resume** follows execution.\n',
        'loop-design'
      ).map((mode) => mode.value)
    ).toEqual(['plan', 'revise', 'critique', 'run', 'resume'])
    expect(
      extractSkillPromptModes(
        '## Interpret the invocation\n```text\n' +
          '$ask [model-family] [effort] <task>\n$ask handoff [model-family] <task>\n```',
        'ask'
      )
    ).toEqual([{ value: 'handoff', description: 'Documented $ask handoff invocation' }])
  })
  it('ignores ordinary steps, other skills, and unsafe values', () => {
    expect(
      extractSkillPromptModes(
        '# Build\n## Steps\n- **Delete** all output.\n' +
          '`$other run <task>`\n```text\n$build <task>\n```',
        'build'
      )
    ).toEqual([])
    expect(extractSkillPromptModes('## Modes\n- **Run\u202eevil** unsafe\n', 'test')).toEqual([])
  })
})
