import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { applyAppearanceColors } from '../lib/appearance-colors'
import { useAppStore } from '../store'

export function useDocumentColors(): void {
  const colors = useAppStore(
    useShallow((s) => ({
      tabBarBackground: s.settings?.tabBarBackground,
      tabBackground: s.settings?.tabBackground,
      activeTabBackground: s.settings?.activeTabBackground,
      statusBarBackground: s.settings?.statusBarBackground,
      accentColor: s.settings?.accentColor
    }))
  )
  useEffect(() => {
    const apply = (): void => applyAppearanceColors(colors)
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [colors])
}
