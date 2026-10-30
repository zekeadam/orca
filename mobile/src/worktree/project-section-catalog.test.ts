import { createProjectGroup } from '../../../src/shared/project-groups'
import { NO_WORKSPACE_ROW_FILTERS } from '../../../src/shared/workspace-view/workspace-row-filters'
import { projectSectionsRead } from './project-sections-operations'
import { buildSections } from './workspace-list-sections'
import { hostRepoCatalogSchema } from '../host-screen/host-screen-reply-schema'
import { desktopSectionRepo } from '../host-screen/use-host-repo-metadata'
import { describe, expect, it } from 'vitest'
import { buildProjectSectionCatalog } from './project-section-catalog'
import type { ServedProjectSections } from './project-sections-operations'

const uploaded = { type: 'image', src: 'data:image/png;base64,AAAA' }

type ServedRepo = ServedProjectSections['repos'][number]

function repo(
  id: string,
  executionHostId?: ServedRepo['executionHostId'],
  repoIcon?: unknown
): ServedRepo {
  return {
    id,
    displayName: 'orca',
    path: `/repos/${id}`,
    badgeColor: undefined,
    addedAt: undefined,
    connectionId: undefined,
    executionHostId,
    projectGroupId: undefined,
    projectGroupOrder: undefined,
    ...(repoIcon ? { repoIcon } : {})
  }
}

describe('buildProjectSectionCatalog', () => {
  it("restores an uploaded icon from the desktop's repo.list only for the same host's repo", () => {
    const served: ServedProjectSections = {
      repos: [repo('r1'), repo('r1', 'runtime:m4air')],
      projects: [],
      setups: [],
      projectOrderBy: 'manual',
      projectGroups: undefined
    }
    const catalog = buildProjectSectionCatalog(
      served,
      [repo('r1', undefined, uploaded)],
      null,
      'manual'
    )
    expect(catalog.repos.map((entry) => entry.repoIcon)).toEqual([uploaded, undefined])
  })
})

describe('installed desktop legacy group metadata', () => {
  const list = () =>
    hostRepoCatalogSchema
      .parse({
        repos: [
          {
            id: 'r1',
            displayName: 'orca',
            path: '/repos/r1',
            projectGroupId: 'focus',
            projectGroupOrder: 7
          }
        ]
      })
      .map(desktopSectionRepo)
  const served = (): ServedProjectSections => ({
    repos: [repo('r1'), repo('r1', 'runtime:remote')],
    projects: [],
    setups: [],
    projectOrderBy: 'manual',
    projectGroups: undefined
  })
  it('retains repo.list membership/rank through schema, projection and catalog for its own host only', () => {
    const catalog = buildProjectSectionCatalog(served(), list(), null, 'manual')
    expect(catalog.repos.map((r) => [r.projectGroupId, r.projectGroupOrder])).toEqual([
      ['focus', 7],
      [undefined, undefined]
    ])
  })
  it('preserves explicit served ungrouping and zero rank instead of overwriting with legacy metadata', () => {
    const source = served()
    source.repos[0] = { ...source.repos[0], projectGroupId: null, projectGroupOrder: 0 }
    const catalog = buildProjectSectionCatalog(source, list(), null, 'manual')
    expect(catalog.repos[0]).toMatchObject({ projectGroupId: null, projectGroupOrder: 0 })
  })
  it('salvages malformed optional group fields without dropping a valid repo', () => {
    const [row] = hostRepoCatalogSchema.parse({
      repos: [{ id: 'r1', displayName: 'orca', projectGroupId: 12, projectGroupOrder: 'bad' }]
    })
    expect(desktopSectionRepo(row)).toMatchObject({
      id: 'r1',
      projectGroupId: undefined,
      projectGroupOrder: undefined
    })
  })
})

describe('observed older desktop envelope with anonymized IDs and paths', () => {
  const rows = Array.from({ length: 15 }, (_, index) => ({
    id: `r${index}`,
    displayName: `Project ${index}`,
    path: `/repos/r${index}`
  }))
  const groups = ['Focus', 'Other', 'Z-stuff'].map((name, index) => ({
    ...createProjectGroup({ name, createdFrom: 'manual', tabOrder: index }),
    id: `g${index}`
  }))
  function oldCatalog() {
    const result = projectSectionsRead.interpret({
      id: 'read',
      ok: true,
      result: { catalog: { repos: rows, projects: [], setups: [], projectOrderBy: 'manual' } }
    })
    if (!result.accepted || !result.value) {
      throw new Error('Observed legacy catalog must remain readable')
    }
    return result.value
  }
  it('recovers all14 memberships across4/4/6 groups from repo.list when served15row catalog omits metadata', () => {
    const listed = hostRepoCatalogSchema
      .parse({
        repos: rows.map((row, index) => ({
          ...row,
          projectGroupId: index < 14 ? `g${index < 4 ? 0 : index < 8 ? 1 : 2}` : null,
          projectGroupOrder: index
        }))
      })
      .map(desktopSectionRepo)
    const catalog = buildProjectSectionCatalog(oldCatalog(), listed, null, 'manual', groups)
    const sections = buildSections(
      [],
      'manual',
      NO_WORKSPACE_ROW_FILTERS,
      '',
      'repo',
      new Set(),
      catalog
    )
    expect(
      sections
        .filter((section) => section.key.startsWith('project-group:'))
        .map((section) => [section.title, section.count])
    ).toEqual([
      ['Focus', 4],
      ['Other', 4],
      ['Z-stuff', 6]
    ])
    expect(catalog.repos.filter((row) => row.projectGroupId)).toHaveLength(14)
    expect(sections.filter((section) => section.repo)).toHaveLength(15)
  })
  it('keeps every served repo visible if the older host refuses repo.list metadata', () => {
    const catalog = buildProjectSectionCatalog(oldCatalog(), [], null, 'manual', groups)
    const sections = buildSections(
      [],
      'manual',
      NO_WORKSPACE_ROW_FILTERS,
      '',
      'repo',
      new Set(),
      catalog
    )
    expect(sections.filter((section) => section.repo)).toHaveLength(15)
    expect(catalog.repos.every((row) => row.projectGroupId === undefined)).toBe(true)
  })
})
