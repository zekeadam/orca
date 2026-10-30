import { stripAnsiEscapeSequences } from '../../../src/shared/ansi-escape-sequences'

const TOKEN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/

export function mobileCodexSessionModelCommandSupported(text: string): boolean {
  return /OpenAI Codex\s*\(v0\.165\.0-alpha\.1\.2\)/.test(stripAnsiEscapeSequences(text))
}

export function mobileCodexModelPickerOpen(text: string): boolean {
  const screen = stripAnsiEscapeSequences(text)
  return (
    screen.includes('Select Model and Effort') && /enter\s+select\s*·\s*esc\s+back/.test(screen)
  )
}

export function mobileCodexModelInputReady(text: string): boolean {
  const screen = stripAnsiEscapeSequences(text)
  return (
    !/Select Model and Effort|Select Reasoning|esc.*back|Would you like/.test(screen) &&
    /(?:OpenAI Codex|GPT-[\w. -]+ (?:low|medium|high|max|ultra|xhigh))/.test(screen) &&
    screen.split(/\r?\n/).some((line) => /^\s*›\s*(?:Ask Codex to do anything)?\s*$/.test(line))
  )
}

/** Captured Codex 0.165 accepts this session-only form, without opening its TUI. */
export function mobileCodexModelCommand(model: string, effort?: string): string | null {
  if (!TOKEN.test(model) || (effort !== undefined && !TOKEN.test(effort))) {
    return null
  }
  return `/model ${model}${effort ? ` --reasoning=${effort}` : ''}`
}

export function readMobileCodexModelConfirmation(text: string): {
  model: string
  effort: string
} | null {
  const matches = [
    ...stripAnsiEscapeSequences(text).matchAll(
      /Model changed to ([a-zA-Z0-9._/-]+) ([a-z]+) for this session only/g
    )
  ]
  const latest = matches.at(-1)
  return latest?.[1] && latest[2] ? { model: latest[1], effort: latest[2] } : null
}
