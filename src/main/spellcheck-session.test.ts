import { describe, expect, it, vi } from 'vitest'
import {
  applySpellcheckLanguages,
  getSpellcheckCapabilities,
  supportedSpellcheckLanguages
} from './spellcheck-session'

function session() {
  return {
    availableSpellCheckerLanguages: ['en-GB', 'en-US', 'hu', 'de'],
    getSpellCheckerLanguages: vi.fn(() => ['en-GB']),
    setSpellCheckerLanguages: vi.fn()
  }
}

describe('local spellcheck session', () => {
  it('reads supported and currently enabled languages from Electron', () => {
    const local = session()
    expect(getSpellcheckCapabilities(local, 'win32')).toEqual({
      managedBy: 'app',
      availableLanguages: local.availableSpellCheckerLanguages,
      enabledLanguages: ['en-GB']
    })
  })

  it.each(['win32', 'linux'] as const)('applies English plus Hungarian on %s', (platform) => {
    const local = session()
    applySpellcheckLanguages(local, ['en-GB', 'hu'], platform)
    expect(local.setSpellCheckerLanguages).toHaveBeenCalledWith(['en-GB', 'hu'])
  })

  it.each([undefined, [], ['invalid_tag'], ['zz-ZZ']])(
    'preserves Electron languages for unusable or absent %j',
    (value) => {
      const local = session()
      applySpellcheckLanguages(local, value, 'win32')
      expect(local.setSpellCheckerLanguages).not.toHaveBeenCalled()
    }
  )

  it('filters unsupported languages when a saved profile moves to another OS', () => {
    const local = session()
    applySpellcheckLanguages(local, ['en-US', 'hu', 'zz-ZZ'], 'linux')
    expect(local.setSpellCheckerLanguages).toHaveBeenCalledWith(['en-US', 'hu'])
  })

  it('never calls the language setter or reads app-managed capabilities on macOS', () => {
    const local = session()
    applySpellcheckLanguages(local, ['en-GB', 'hu'], 'darwin')
    expect(getSpellcheckCapabilities(local, 'darwin').managedBy).toBe('system')
    expect(local.getSpellCheckerLanguages).not.toHaveBeenCalled()
    expect(local.setSpellCheckerLanguages).not.toHaveBeenCalled()
  })

  it('does not set unchanged languages and uses dynamic availability', () => {
    const local = session()
    applySpellcheckLanguages(local, ['en-GB'], 'win32')
    expect(local.setSpellCheckerLanguages).not.toHaveBeenCalled()
    local.availableSpellCheckerLanguages = ['hu']
    expect(
      supportedSpellcheckLanguages(['en-GB', 'hu'], getSpellcheckCapabilities(local, 'win32'))
    ).toEqual(['hu'])
  })
})
