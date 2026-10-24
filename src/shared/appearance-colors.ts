import { normalizeRepoBadgeColor } from './repo-badge-color'

export const APPEARANCE_COLOR_KEYS = [
  'tabBarBackground',
  'tabBackground',
  'activeTabBackground',
  'statusBarBackground',
  'accentColor'
] as const

export type AppearanceColorKey = (typeof APPEARANCE_COLOR_KEYS)[number]
export type AppearanceColors = Partial<Record<AppearanceColorKey, string>>

export function normalizeAppearanceColor(value: unknown): string | undefined {
  return normalizeRepoBadgeColor(value) ?? undefined
}

/** Only supplied keys are returned so partial writes cannot reset other colors. */
export function normalizeAppearanceColors(value: AppearanceColors | undefined): AppearanceColors {
  const normalized: AppearanceColors = {}
  for (const key of APPEARANCE_COLOR_KEYS) {
    if (value && Object.hasOwn(value, key)) {
      normalized[key] = normalizeAppearanceColor(value[key])
    }
  }
  return normalized
}
