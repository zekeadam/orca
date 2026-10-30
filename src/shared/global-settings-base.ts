import type { NativeChatPromptPreset } from './native-chat-prompt-presets'
import type { ClaudeAccountSwitchSettings } from './claude-account-switch-settings'
import type { AppearanceColors } from './appearance-colors'
import type { AppFontSettings } from './app-font-settings'
import type { NativeChatGlobalSettings } from './native-chat-appearance-settings'
import type { WorktreeDeletionPreferences } from './worktree-deletion-preferences'

/** Settings groups owned by their feature modules and composed into GlobalSettings. */
export type GlobalSettingsBase = NativeChatGlobalSettings &
  AppearanceColors &
  AppFontSettings &
  WorktreeDeletionPreferences &
  ClaudeAccountSwitchSettings & { nativeChatPromptPresets?: NativeChatPromptPreset[] }
