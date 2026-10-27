import React, { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { NativeChatPromptEditor } from '../../../src/renderer/src/components/native-chat/NativeChatPromptEditor'
import type { NativeChatComposerInput } from '../../../src/renderer/src/components/native-chat/native-chat-composer-input'
import './styles.css'

function Fixture(): React.JSX.Element {
  const input = useRef<NativeChatComposerInput | null>(null)
  const [mount, setMount] = useState(0)
  const [draft, setDraft] = useState('')
  const [label, setLabel] = useState('Literal Markdown source')
  Object.assign(window, {
    markdownHarness: {
      get: () => ({
        value: input.current?.value,
        start: input.current?.selectionStart,
        end: input.current?.selectionEnd
      }),
      set: (value: string) => {
        if (input.current) {
          input.current.value = value
        }
        setDraft(value)
      },
      select: (start: number, end = start) => {
        input.current?.setSelectionRange(start, end)
        input.current?.focus()
      },
      pill: () => input.current?.insertSkill(0, 0, '$review'),
      file: () => input.current?.insertFileReferences(['src/example.ts']),
      remount: () => {
        setDraft(input.current?.value ?? '')
        setMount((current) => current + 1)
      },
      label: setLabel
    }
  })
  return (
    <main className="native-chat-appearance min-h-screen bg-chat-canvas p-8 text-sm text-chat-foreground">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-sm font-semibold text-chat-foreground-strong">{label}</h1>
        <div className="rounded-xl border border-chat-composer-border bg-chat-composer-surface p-2">
          <NativeChatPromptEditor
            key={mount}
            scopeKey="markdown-rendered-fixture"
            inputRef={input}
            initialValue={draft}
            disabled={false}
            placeholder="Write a prompt"
            onChange={(current) => setDraft(current.value)}
            onSelect={() => {}}
            className="min-h-12 w-full bg-transparent px-2 py-1 text-sm text-chat-foreground-strong outline-none max-h-[calc(8lh+0.5rem)] overflow-y-auto scrollbar-sleek"
          />
        </div>
        <p className="text-xs text-chat-foreground-faint">
          Actual NativeChatPromptEditor | canonical Orca CSS | isolated profile
        </p>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Fixture />)
