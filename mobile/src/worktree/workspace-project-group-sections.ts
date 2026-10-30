import type { ProjectGroup } from '../../../src/shared/project-group-types'
import {
  getDistinctProjectGroups,
  getEffectiveProjectGroupManualRank
} from '../../../src/shared/project-groups'
import { getProjectGroupHeaderKey } from '../../../src/shared/sidebar-list/group-keys'
import { compareCodePoints, compareSidebarText } from '../../../src/shared/sidebar-list/text-order'
import { compareRecentRank, recentRankForEntry } from '../../../src/shared/project-section-order'
import type { ProjectSectionCatalog } from './workspace-list-sections'
import type { Section } from './workspace-list-types'

/** The shipped phone list keeps the desktop's project-group tree and collapse keys. */
export function groupMobileProjectSections(
  sections: Section[],
  catalog: ProjectSectionCatalog | undefined,
  collapsed: ReadonlySet<string>
): Section[] {
  if (!catalog?.projectGroups?.length) {
    return sections
  }
  const groups = getDistinctProjectGroups(catalog.projectGroups)
  const byId = new Map(groups.map((group) => [group.id, group]))
  const children = new Map<string | null, ProjectGroup[]>()
  for (const group of groups) {
    const parent = group.parentGroupId && byId.has(group.parentGroupId) ? group.parentGroupId : null
    const siblings = children.get(parent) ?? []
    siblings.push(group)
    children.set(parent, siblings)
  }
  for (const siblings of children.values()) {
    siblings.sort(
      (a, b) =>
        a.tabOrder - b.tabOrder ||
        compareSidebarText(a.name, b.name) ||
        compareCodePoints(a.executionHostId ?? '', b.executionHostId ?? '') ||
        compareCodePoints(a.id, b.id)
    )
  }
  const buckets = new Map<string | null, Section[]>()
  for (const section of sections) {
    if (section.key === 'pinned') {
      continue
    }
    const id = section.repo?.projectGroupId
    const key = id && byId.has(id) ? id : null
    const bucket = buckets.get(key) ?? []
    bucket.push(section)
    buckets.set(key, bucket)
  }
  const recentRank = (section: Section) =>
    recentRankForEntry([
      section.key,
      {
        label: section.title,
        repo: section.repo,
        items: section.data,
        repoIds: new Set(section.repo ? [section.repo.id] : [])
      }
    ])
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) =>
      catalog.projectOrderBy === 'recent'
        ? compareRecentRank(recentRank(a), recentRank(b))
        : getEffectiveProjectGroupManualRank(a.repo, catalog.repoOrder) -
          getEffectiveProjectGroupManualRank(b.repo, catalog.repoOrder)
    )
  }
  const result = sections.filter((section) => section.key === 'pinned')
  const count = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) {
      return 0
    }
    seen.add(id)
    return (
      (buckets.get(id)?.length ?? 0) +
      (children.get(id) ?? []).reduce((n, g) => n + count(g.id, seen), 0)
    )
  }
  const visited = new Set<string>()
  const append = (group: ProjectGroup, depth: number) => {
    if (visited.has(group.id)) {
      return
    }
    visited.add(group.id)
    const key = getProjectGroupHeaderKey(group.id)
    result.push({
      key,
      title: group.name,
      count: count(group.id),
      data: [],
      projectGroupDepth: depth
    })
    if (collapsed.has(key)) {
      return
    }
    result.push(
      ...(buckets.get(group.id) ?? []).map((section) => ({
        ...section,
        projectGroupDepth: depth + 1
      }))
    )
    for (const child of children.get(group.id) ?? []) {
      append(child, depth + 1)
    }
  }
  for (const group of children.get(null) ?? []) {
    append(group, 0)
  }
  result.push(...(buckets.get(null) ?? []))
  return result
}
