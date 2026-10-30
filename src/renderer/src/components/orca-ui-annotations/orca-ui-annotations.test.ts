// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureOrcaElement, isOrcaAnnotationShortcut } from './orca-ui-annotation-capture'
import type { Repo } from '../../../../shared/repo-types'
import type { BrowserPageAnnotation } from '../../../../shared/browser-grab-types'

const mocks = vi.hoisted(() => ({ launch: vi.fn(), getState: vi.fn() }))
vi.mock('@/store', () => ({ useAppStore: { getState: mocks.getState } }))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: mocks.launch }))
import {
  ORCA_ANNOTATION_PROMPT,
  formatOrcaAnnotations,
  resolveOrcaAnnotationRepo,
  sendOrcaAnnotations
} from './orca-ui-annotation-send'

function repo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'orca',
    path: '/projects/orca',
    displayName: 'Orca',
    badgeColor: '',
    addedAt: 0,
    ...overrides
  }
}
function annotation(): BrowserPageAnnotation {
  const button = document.createElement('button')
  button.textContent = 'Settings'
  document.body.append(button)
  return {
    id: 'one',
    browserPageId: 'orca-ui',
    comment: 'Make this clearer',
    intent: 'change',
    priority: 'suggestion',
    createdAt: '',
    payload: captureOrcaElement(button)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.replaceChildren()
})

describe('Orca UI annotation capture', () => {
  it('matches Alt+á and rejects AltGr, repeats, composition and unrelated keys', () => {
    expect(isOrcaAnnotationShortcut(new KeyboardEvent('keydown', { key: 'Á', altKey: true }))).toBe(
      true
    )
    for (const extra of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { repeat: true },
      { isComposing: true },
      { key: 'a' }
    ]) {
      expect(
        isOrcaAnnotationShortcut(new KeyboardEvent('keydown', { key: 'á', altKey: true, ...extra }))
      ).toBe(false)
    }
  })
  it('keeps stable test selectors and never captures password values or descendant markup', () => {
    const container = document.createElement('div')
    container.dataset.testid = 'settings'
    const input = document.createElement('input')
    input.type = 'password'
    input.value = 'secret-password'
    container.append(input)
    document.body.append(container)
    expect(captureOrcaElement(input).target.selector).toBe(
      'div[data-testid="settings"] > input:nth-of-type(1)'
    )
    expect(JSON.stringify(captureOrcaElement(input))).not.toContain('secret-password')
    expect(captureOrcaElement(container).target.htmlSnippet).toBe('')
  })
})

describe('Orca annotation delivery', () => {
  it('preserves the exact requested prefix and includes feedback and element context', () => {
    const prompt = formatOrcaAnnotations([annotation()])
    expect(prompt.startsWith(`${ORCA_ANNOTATION_PROMPT}\n\n`)).toBe(true)
    expect(prompt).toContain('Make this clearer')
    expect(prompt).toContain('Settings')
    expect(prompt).toContain('**Selector:**')
  })
  it('prefers the registered fork identity and refuses ambiguous/missing targets', () => {
    const fork = repo({
      id: 'fork',
      displayName: 'My fork',
      gitRemoteIdentity: {
        canonicalKey: 'github.com/zekeadam/orca',
        remoteName: 'origin',
        remoteUrl: 'https://github.com/zekeadam/orca.git'
      }
    })
    expect(resolveOrcaAnnotationRepo([repo(), fork])).toBe(fork)
    expect(() => resolveOrcaAnnotationRepo([])).toThrow('Add the Orca repository')
    expect(() => resolveOrcaAnnotationRepo([repo(), repo({ id: 'second' })])).toThrow('Multiple')
  })
  it('routes to the repository host and waits for confirmed delivery', async () => {
    const target = repo({ connectionId: 'remote' })
    mocks.getState.mockReturnValue({
      repos: [target],
      worktreesByRepo: { orca: [{ id: 'primary', isMainWorktree: true }] },
      setActiveWorktree: vi.fn()
    })
    mocks.launch.mockReturnValue({ promptDeliveryResult: Promise.resolve({ delivered: true }) })
    await sendOrcaAnnotations([annotation()])
    expect(mocks.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'codex',
        requestedSurface: 'chat',
        selectedExecutionHostId: 'ssh:remote',
        worktreeId: 'primary',
        promptKeptByCaller: true,
        promptDelivery: 'submit-after-ready'
      })
    )
    mocks.launch.mockReturnValue({ promptDeliveryResult: Promise.resolve({ delivered: false }) })
    await expect(sendOrcaAnnotations([annotation()])).rejects.toThrow('Delivery was not confirmed')
    mocks.launch.mockReturnValue(null)
    await expect(sendOrcaAnnotations([annotation()])).rejects.toThrow('Could not open')
  })
})
