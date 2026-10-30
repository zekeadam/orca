import type { TabGroupLayoutNode } from '../../../../shared/tab-types'
import { TabGroupSplitNodeTree } from './TabGroupSplitNodeTree'
import { WorkspaceTabDragLayer } from './WorkspaceTabDragLayer'

/** The main workspace surface: the shared drag scope and group tree under main-window chrome
 *  (drag strip, left seam border). Hosts with their own chrome compose the two parts directly. */
export default function TabGroupSplitLayout({
  layout,
  worktreeId,
  focusedGroupId,
  isWorktreeActive
}: {
  layout: TabGroupLayoutNode
  worktreeId: string
  focusedGroupId?: string
  isWorktreeActive: boolean
}): React.JSX.Element {
  return (
    <WorkspaceTabDragLayer worktreeId={worktreeId} enabled={isWorktreeActive}>
      {({ isTabDragActive, hoveredTabInsertion, setDragRootNode }) => (
        /* The tab row owns the 40px chrome band; its top edge remains a window drag surface. */
        <div
          ref={setDragRootNode}
          className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden border-l border-border"
        >
          <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
            <TabGroupSplitNodeTree
              layout={layout}
              worktreeId={worktreeId}
              focusedGroupId={focusedGroupId}
              isWorktreeActive={isWorktreeActive}
              isTabDragActive={isTabDragActive}
              hoveredTabInsertion={hoveredTabInsertion}
            />
          </div>
        </div>
      )}
    </WorkspaceTabDragLayer>
  )
}
