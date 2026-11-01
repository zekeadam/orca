import { createElement, Fragment, type ReactNode } from 'react'
import { Text } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { Section, Worktree } from '../worktree/workspace-list-types'
import type { MobileViewState } from '../worktree/workspace-view-settings'

const { rowRenders } = vi.hoisted(() => ({ rowRenders: vi.fn() }))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  RefreshControl: 'RefreshControl',
  // Renders every row through the list's own renderItem, as a mounted SectionList would.
  SectionList: ({
    sections,
    keyExtractor,
    renderItem
  }: {
    sections: Section[]
    keyExtractor: (item: Worktree) => string
    renderItem: (info: { item: Worktree; section: Section }) => ReactNode
  }) =>
    sections.flatMap((section) =>
      section.data.map((item) =>
        createElement(Fragment, { key: keyExtractor(item) }, renderItem({ item, section }))
      )
    ),
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  View: 'View'
}))
vi.mock('lucide-react-native', () => ({
  Server: 'Server',
  Monitor: 'Monitor',
  GitBranch: 'GitBranch'
}))
vi.mock('../platform/haptics', () => ({ triggerMediumImpact: vi.fn() }))
vi.mock('../components/AgentSpinner', () => ({ AgentSpinner: () => null }))
vi.mock('../components/MobileRepoIcon', () => ({ MobileRepoIcon: () => null }))
vi.mock('../components/WorktreeAgentList', () => ({ WorktreeAgentList: () => null }))
// The row always renders the glyphs, so each call is one row render.
vi.mock('../components/WorktreeMetaGlyphs', () => ({
  prStateColor: () => '#000000',
  WorktreeMetaGlyphs: () => {
    rowRenders()
    return null
  }
}))
// Off this embedded path; mocked for their native imports.
vi.mock('../components/MobileSearchField', () => ({}))
vi.mock('../components/NewWorkspaceFab', () => ({ FAB_SIZE: 56 }))

import { buildSections } from '../worktree/workspace-list-sections'
import { NO_WORKSPACE_ROW_FILTERS } from '../../../src/shared/workspace-view/workspace-row-filters'
import { HostWorkspaceList } from './host-workspace-list'
import { INITIAL_MOBILE_VIEW } from '../worktree/workspace-view-settings'

function worktree(id: string, overrides: Partial<Worktree> = {}): Worktree {
  return {
    worktreeId: `repo-1::${id}`,
    repoId: 'repo-1',
    repo: 'orca',
    branch: `feature/${id}`,
    displayName: id,
    path: id,
    liveTerminalCount: 1,
    hasAttachedPty: true,
    unread: false,
    isPinned: false,
    linkedPR: null,
    status: 'active',
    ...overrides
  }
}

const noop = () => {}
const stable = { ref: { current: null }, repoById: new Map() }

function listProps(worktrees: Worktree[], view: Partial<MobileViewState> = { groupBy: 'none' }) {
  // Each poll re-parses the payload, so rows are fresh objects even when nothing changed.
  const polled: Worktree[] = JSON.parse(JSON.stringify(worktrees))
  const groupBy = view.groupBy ?? 'none'
  const sections = buildSections(polled, 'name', NO_WORKSPACE_ROW_FILTERS, '', groupBy, new Set())
  const controller = {
    actions: { openWorktreeSession: noop, openNewWorktreeModal: noop },
    activeWorktreeScroll: { sectionListRef: stable.ref, onScrollToIndexFailed: noop },
    catalog: { refreshing: false, onRefresh: noop },
    connState: 'connected',
    displayWorktrees: polled,
    embedded: true,
    insets: { bottom: 0 },
    isReadOnly: false,
    now: 1_000,
    reconnectAttempts: 0,
    relayRecovery: { pairingRejected: false },
    sectionsResult: { rawSections: sections, sections, repoById: stable.repoById },
    settings: {
      activeFilterCount: 0,
      toggleWorktreeLineage: noop,
      pendingViewChanges: { pending: [], stale: false }
    },
    state: {
      actionError: '',
      setActionTarget: noop,
      view: { ...INITIAL_MOBILE_VIEW, groupBy, ...view },
      search: '',
      showSearch: false,
      worktreesLoaded: true
    }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the list reads only the controller fields above on this connected, embedded, error-free path.
  return { controller } as unknown as Parameters<typeof HostWorkspaceList>[0]
}

describe('host list rows across polls', () => {
  it.each([
    { compactWorktreeCards: false, newCardStyle: false },
    { compactWorktreeCards: true, newCardStyle: false },
    { compactWorktreeCards: false, newCardStyle: true }
  ])('names every project in the mixed Pinned section with repo grouping: %j', (layout) => {
    const rows = [
      worktree('watch', { repo: 'z-watch', displayName: 'main', isPinned: true }),
      worktree('skills', {
        repoId: 'repo-2',
        repo: 'z-skills',
        displayName: 'main',
        isPinned: true
      }),
      worktree('regular', { repoId: 'repo-3', repo: 'orca' })
    ]
    const props = listProps(rows, { groupBy: 'repo', ...layout })
    const pinned = props.controller.sectionsResult.sections.find(
      (section) => section.key === 'pinned'
    )
    expect(pinned?.repo).toBeUndefined()
    expect(pinned?.data).toHaveLength(2)
    let tree: ReactTestRenderer | null = null
    act(() => {
      tree = create(createElement(HostWorkspaceList, props))
    })
    const texts = tree!.root.findAllByType(Text).map((node) => node.props.children)
    expect(texts).toEqual(expect.arrayContaining(['z-watch', 'z-skills']))
    // The actual project section already names orca, so its own row stays quiet.
    expect(texts).not.toContain('orca')
    act(() => tree!.unmount())
  })

  it('keeps folder and SSH projects named in Pinned and cross-project children named under a repo', () => {
    const folder = worktree('folder', {
      repo: 'notes',
      workspaceKind: 'folder-workspace',
      isPinned: true
    })
    const remote = worktree('ssh', {
      repoId: 'ssh-repo',
      repo: 'remote-app',
      hostId: 'ssh:server',
      isPinned: true
    })
    const child = worktree('child', {
      repoId: 'child-repo',
      repo: 'child-project',
      showProjectName: true,
      lineageDepth: 1
    })
    const props = listProps([folder, remote, worktree('parent')], { groupBy: 'repo' })
    const parentSection = props.controller.sectionsResult.sections.find(
      (section) => section.repo?.id === 'repo-1'
    )
    if (!parentSection) {
      throw new Error('fixture project section missing')
    }
    parentSection.data.push(child)
    let tree: ReactTestRenderer | null = null
    act(() => {
      tree = create(createElement(HostWorkspaceList, props))
    })
    const texts = tree!.root.findAllByType(Text).map((node) => node.props.children)
    expect(texts).toEqual(expect.arrayContaining(['notes', 'remote-app', 'child-project']))
    act(() => tree!.unmount())
  })

  it('re-renders only the row whose worktree changed', () => {
    const rows = [worktree('a'), worktree('b'), worktree('c')]
    let tree: ReactTestRenderer | null = null
    act(() => {
      tree = create(createElement(HostWorkspaceList, listProps(rows)))
    })
    rowRenders.mockClear()

    const changed = [rows[0]!, { ...rows[1]!, branch: 'feature/b-renamed' }, rows[2]!]
    act(() => tree!.update(createElement(HostWorkspaceList, listProps(changed))))

    expect(rowRenders).toHaveBeenCalledTimes(1)
    act(() => tree!.unmount())
  })
  it('re-renders only the workspace whose child roster changed', () => {
    const row = worktree('a', {
      agents: [
        {
          paneKey: 'parent',
          parentPaneKey: null,
          state: 'working',
          agentType: 'codex',
          prompt: '',
          taskTitle: null,
          displayName: null,
          lastAssistantMessage: null,
          toolName: null,
          toolInput: null,
          interrupted: false,
          stateStartedAt: 1,
          updatedAt: 1,
          subagents: [{ id: 'child', state: 'working', startedAt: 1 }]
        }
      ]
    })
    let tree: ReactTestRenderer | null = null
    act(() => {
      tree = create(createElement(HostWorkspaceList, listProps([row, worktree('b')])))
    })
    rowRenders.mockClear()
    const changed = {
      ...row,
      agents: [
        {
          ...row.agents![0]!,
          subagents: [{ id: 'child', state: 'waiting' as const, startedAt: 1 }]
        }
      ]
    }
    act(() => tree!.update(createElement(HostWorkspaceList, listProps([changed, worktree('b')]))))
    expect(rowRenders).toHaveBeenCalledTimes(1)
    act(() => tree!.unmount())
  })
})
