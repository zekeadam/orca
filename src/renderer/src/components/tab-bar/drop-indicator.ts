export type DropIndicator = 'left' | 'right' | null

// Why: the theme's accent color is too subtle for a drag-and-drop insertion
// cue. A vivid blue matches VS Code's tab.dragAndDropBorder and is immediately
// visible against all tab backgrounds. Pseudo-elements sit above the tab's
// own border so the indicator does not shift layout.
export function getDropIndicatorClasses(dropIndicator: DropIndicator): string {
  if (dropIndicator === 'left') {
    return "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-blue-500 before:z-10 before:content-['']"
  }
  if (dropIndicator === 'right') {
    return "after:absolute after:inset-y-0 after:right-0 after:w-[2px] after:bg-blue-500 after:z-10 after:content-['']"
  }
  return ''
}

// Selection is carried by the active tab surface; retain this export for tab consumers.
export const ACTIVE_TAB_INDICATOR_CLASSES = 'hidden'

export function getTabRootStateClasses(isActive: boolean): string {
  return isActive
    ? 'appearance-active-tab focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring bg-active-tab-background text-active-tab-foreground'
    : 'appearance-tab focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring bg-tab-background text-tab-foreground hover:text-foreground'
}

export function getTabStripBorderClasses(
  hasTabsToRight: boolean,
  options?: { includeTopBorder?: boolean }
): string {
  const includeTopBorder = options?.includeTopBorder ?? true
  return [includeTopBorder ? 'border-t' : '', hasTabsToRight ? 'border-r' : '', 'border-border']
    .filter(Boolean)
    .join(' ')
}
