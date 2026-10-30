import { describe, expect, it } from 'vitest'
import { createProjectGroup } from '../../../src/shared/project-groups'
import { NO_PROJECT_SECTION_CATALOG, type ProjectSectionCatalog } from './workspace-list-sections'
import { groupMobileProjectSections } from './workspace-project-group-sections'
import type { Section, Worktree } from './workspace-list-types'

const focus = {
  ...createProjectGroup({ name: 'Current Focus', createdFrom: 'manual', tabOrder: 0 }),
  id: 'focus'
}
const other = {
  ...createProjectGroup({ name: 'Other', createdFrom: 'manual', tabOrder: 2 }),
  id: 'other'
}
const nested = {
  ...createProjectGroup({
    name: 'Nested',
    createdFrom: 'manual',
    tabOrder: 1,
    parentGroupId: 'focus'
  }),
  id: 'nested'
}
const catalog: ProjectSectionCatalog = {
  ...NO_PROJECT_SECTION_CATALOG,
  projectGroups: [other, nested, focus]
}
const section = (id: string, group: string | null, rank: number): Section => ({
  key: id,
  title: id,
  repo: { id, displayName: id, path: `/${id}`, projectGroupId: group, projectGroupOrder: rank },
  data: []
})
const a = section('a', 'focus', 5),
  b = section('b', 'focus', 1),
  c = section('c', 'nested', 0),
  d = section('d', 'other', 0)
const keys = (rows: Section[]) => rows.map((row) => row.key)
describe('the shipped mobile list follows desktop project groups', () => {
  it('keeps group tab order, per-group manual order, nesting and ungrouped repos', () => {
    const rows = groupMobileProjectSections(
      [a, d, c, b, section('missing', 'unavailable', 0)],
      catalog,
      new Set()
    )
    expect(keys(rows)).toEqual([
      'project-group:focus',
      'b',
      'a',
      'project-group:nested',
      'c',
      'project-group:other',
      'd',
      'missing'
    ])
    expect(rows[0]).toMatchObject({ title: 'Current Focus', count: 3, projectGroupDepth: 0 })
    expect(rows.find((row) => row.key === 'c')?.projectGroupDepth).toBe(2)
  })
  it('uses the desktop collapse key to hide all descendant headers and rows', () => {
    const rows = groupMobileProjectSections([a, b, c, d], catalog, new Set(['project-group:focus']))
    expect(keys(rows)).toEqual(['project-group:focus', 'project-group:other', 'd'])
    expect(rows[0].count).toBe(3)
  })
  it('keeps pinned workspaces above groups, including when their owner group is collapsed', () => {
    const pinned: Section = { key: 'pinned', title: 'Pinned', data: [] }
    expect(
      keys(groupMobileProjectSections([pinned, a], catalog, new Set(['project-group:focus'])))[0]
    ).toBe('pinned')
  })
  it('retains the older desktop fallback and other grouping modes', () => {
    const rows = [a, b]
    expect(groupMobileProjectSections(rows, undefined, new Set())).toBe(rows)
    expect(groupMobileProjectSections(rows, NO_PROJECT_SECTION_CATALOG, new Set())).toBe(rows)
  })
  it('uses visible workspace activity for Recent project order within a group', () => {
    const row = (lastActivityAt: number): Worktree => ({
      worktreeId: 'w',
      repoId: 'r',
      repo: 'r',
      branch: 'main',
      displayName: 'w',
      path: '/r',
      liveTerminalCount: 0,
      hasAttachedPty: false,
      unread: false,
      isPinned: false,
      linkedPR: null,
      lastActivityAt
    })
    const rows = groupMobileProjectSections(
      [
        { ...a, data: [row(100)] },
        { ...b, data: [row(10)] }
      ],
      { ...catalog, projectOrderBy: 'recent' },
      new Set()
    )
    expect(keys(rows).slice(0, 3)).toEqual(['project-group:focus', 'a', 'b'])
  })
})
