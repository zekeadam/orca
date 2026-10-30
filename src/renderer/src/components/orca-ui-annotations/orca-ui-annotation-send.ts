import { useAppStore } from '@/store'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/repo-types'
import type { BrowserPageAnnotation } from '../../../../shared/browser-grab-types'
import { formatBrowserAnnotationsAsMarkdown } from '../browser-pane/annotate/browser-annotation-output'

export const ORCA_ANNOTATION_PROMPT =
  '$smart-execution $loop-design max 30m; a plan $research s build $simplify-work a $review; run auto'

export function resolveOrcaAnnotationRepo(repos: readonly Repo[]): Repo {
  const fork = repos.filter(
    (repo) => repo.gitRemoteIdentity?.canonicalKey.toLowerCase() === 'github.com/zekeadam/orca'
  )
  const candidates = fork.length
    ? fork
    : repos.filter(
        (repo) =>
          !repo.gitRemoteIdentity &&
          (repo.displayName.toLowerCase() === 'orca' ||
            repo.path
              .replace(/[\\/]+$/, '')
              .split(/[\\/]/)
              .at(-1)
              ?.toLowerCase() === 'orca')
      )
  if (candidates.length !== 1) {
    throw new Error(
      candidates.length
        ? 'Multiple Orca repositories found. Keep one Orca target registered before sending.'
        : 'Add the Orca repository to send UI annotations.'
    )
  }
  const [repo] = candidates
  return repo
}

export function formatOrcaAnnotations(annotations: BrowserPageAnnotation[]): string {
  return `${ORCA_ANNOTATION_PROMPT}\n\n${formatBrowserAnnotationsAsMarkdown(annotations)}`
}

export async function sendOrcaAnnotations(annotations: BrowserPageAnnotation[]): Promise<void> {
  const store = useAppStore.getState()
  const repo = resolveOrcaAnnotationRepo(store.repos)
  if (!store.worktreesByRepo[repo.id]?.length) {
    await store.fetchWorktrees(repo.id)
  }
  const state = useAppStore.getState()
  const worktree = state.worktreesByRepo[repo.id]?.find((item) => item.isMainWorktree)
  if (!worktree) {
    throw new Error('Open the primary Orca workspace before sending UI annotations.')
  }
  const hostId = getRepoExecutionHostId(repo)
  const result = launchAgentInNewTab({
    requestId: newAgentLaunchRequestId(),
    agent: 'codex',
    requestedSurface: 'chat',
    selectedExecutionHostId: hostId,
    worktreeId: worktree.id,
    prompt: formatOrcaAnnotations(annotations),
    promptDelivery: 'submit-after-ready',
    promptKeptByCaller: true,
    launchSource: 'notes_send',
    beforeSurfaceOpen: () => {
      state.setActiveWorktree(worktree.id, hostId)
    },
    onStructuredHostDeclined: () => ({ opened: false })
  })
  if (!result) {
    throw new Error('Could not open an Orca chat. Annotations are still queued.')
  }
  const delivery = result.promptDeliveryResult
  if (!delivery || !(await delivery).delivered) {
    throw new Error(
      'Delivery was not confirmed. Annotations are still queued; check the new chat before retrying.'
    )
  }
}
