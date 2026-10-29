import type { RefObject } from 'react'
import { NativeChatPromptPresets } from './NativeChatPromptPresets'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'
import type { NativeChatStructuredComposerSend } from './use-native-chat-structured-composer-send'

export function NativeChatComposerPresets(props: {
  enabled: boolean
  disabled: boolean
  scope: { draftScopeKey: string; targetPtyId: string | null }
  editor: {
    draft: string
    setDraft: (text: string) => void
    setCaret: (caret: number) => void
    textareaRef: RefObject<NativeChatComposerInput | null>
  }
  structuredTransport?: NativeChatStructuredComposerTransport
  sendStructured: NativeChatStructuredComposerSend
  sendPty: (text?: string) => void
}): React.JSX.Element {
  return (
    <NativeChatPromptPresets
      enabled={props.enabled}
      disabled={props.disabled}
      ownerKey={JSON.stringify([
        props.scope.draftScopeKey,
        props.scope.targetPtyId,
        props.structuredTransport?.sessionId,
        props.structuredTransport?.runtimeEnvironmentId
      ])}
      onSend={(text) => {
        if (props.disabled) {
          return
        }
        if (props.structuredTransport) {
          void props.sendStructured(text, [], true)
        } else {
          props.sendPty(text)
        }
      }}
      onInsert={(text) => {
        const next = props.editor.draft.trim() === '' ? text : `${props.editor.draft}\n\n${text}`
        props.editor.setDraft(next)
        props.editor.setCaret(next.length)
      }}
      onFocus={() => props.editor.textareaRef.current?.focus()}
    />
  )
}
