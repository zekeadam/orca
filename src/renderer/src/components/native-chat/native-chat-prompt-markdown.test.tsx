// @vitest-environment happy-dom
import { createRef } from 'react'
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeChatPromptEditor } from './NativeChatPromptEditor'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import { promptEditor } from './native-chat-prompt-editor.test-support'
import { promptTextPosition } from './native-chat-prompt-document'
import {
  clearNativeChatDraftCacheForTests,
  readNativeChatDraftDocument
} from './native-chat-draft-cache'
import { PROMPT_MARKDOWN_MAX_SIZE, promptMarkdownPluginKey } from './native-chat-prompt-markdown'

afterEach(() => {
  cleanup()
  clearNativeChatDraftCacheForTests()
})

function setup(value = '', scopeKey?: string) {
  const inputRef = createRef<NativeChatComposerInput>()
  const onChange = vi.fn()
  const view = render(
    <NativeChatPromptEditor
      inputRef={inputRef}
      initialValue={value}
      scopeKey={scopeKey}
      disabled={false}
      placeholder="Message"
      onChange={onChange}
      onSelect={vi.fn()}
    />
  )
  const textbox = within(view.container).getByRole('textbox')
  return { ...view, input: inputRef.current!, editor: promptEditor(textbox), textbox, onChange }
}

describe('lossless Markdown presentation in the prompt editor', () => {
  it.each([
    ['heading', '# Heading', 'font-semibold'],
    ['heading', 'Heading\n=======', 'font-semibold'],
    ['strong', '**strong**', 'font-semibold'],
    ['emphasis', '*emphasis*', 'italic'],
    ['delete', '~~strike~~', 'line-through'],
    ['inlineCode', '`const value = 1`', 'text-chat-code'],
    ['code', '```ts\n**literal**\n```', 'text-chat-code'],
    ['link', '[label](https://example.test)', 'underline'],
    ['listItem', '- [ ] task\n- item', 'font-medium'],
    ['listItem', '1. ordered\n2. next', 'font-medium'],
    ['blockquote', '> quoted\n> again', 'font-medium']
  ])('styles %s while keeping every source character: %s', (kind, source, className) => {
    const { input, container, editor } = setup(source)
    const decorated = container.querySelector(`[data-prompt-markdown="${kind}"]`)
    expect(decorated).not.toBeNull()
    expect(decorated?.classList.contains(className)).toBe(true)
    expect(input.value).toBe(source)
    expect(editor.state.doc.toJSON().content?.every((block) => block.type === 'paragraph')).toBe(
      true
    )
    expect(container.querySelector('a, h1, ul, ol, blockquote, pre, strong, em')).toBeNull()
  })

  it('leaves escaped and incomplete markup literal, and ignores syntax inside code', () => {
    const source = '\\*escaped\\* **unfinished [link](\n\n`**literal**`\n\n~~~\n# not a heading\n'
    const { input, container } = setup(source)
    expect(input.value).toBe(source)
    expect(container.querySelector('[data-prompt-markdown="strong"]')).toBeNull()
    expect(container.querySelector('[data-prompt-markdown="emphasis"]')).toBeNull()
    expect(container.querySelector('[data-prompt-markdown="heading"]')).toBeNull()
    expect(container.querySelector('[data-prompt-markdown="code"]')).not.toBeNull()
  })

  it('keeps UTF16, nested/multiline ranges, blank lines and trailing spaces exact', () => {
    const source = '😀 **bold *nested*\nnext**  \n\n[end](javascript:alert%281%29)\n'
    const { input, container } = setup(source)
    expect(input.value).toBe(source)
    expect(container.querySelector('[data-prompt-markdown="strong"]')?.textContent).toContain(
      '**bold '
    )
    expect(container.querySelector('[data-prompt-markdown="emphasis"]')?.textContent).toBe(
      '*nested*'
    )
    expect(container.querySelector('a, script, img')).toBeNull()
  })

  it('renders HTML as literal text and never inserts executable elements', () => {
    const source =
      '<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n<a href="https://example.test">x</a>'
    const { input, container } = setup(source)
    expect(input.value).toBe(source)
    expect(container.querySelector('script, img, a')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
  })

  it('masks skill/file tokens and splits decorations around every pill and hard break', async () => {
    const { editor, input, container } = setup()
    await act(async () =>
      editor.commands.setContent({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '😀 **before ' },
              { type: 'nativeChatSkill', attrs: { token: '$`\n# bad' } },
              { type: 'nativeChatFileReference', attrs: { token: '@`**\n~~~', path: '/**/file' } },
              { type: 'nativeChatImageReference', attrs: { attachmentId: 'image-1' } },
              { type: 'text', text: ' after' },
              { type: 'hardBreak' },
              { type: 'text', text: 'end**' }
            ]
          }
        ]
      })
    )
    const raw = input.value
    expect(raw).toContain('$`\n# bad@`**\n~~~')
    expect(container.querySelectorAll('[data-prompt-markdown="strong"]')).toHaveLength(3)
    expect(
      container.querySelector('[data-prompt-markdown="code"], [data-prompt-markdown="heading"]')
    ).toBeNull()
    for (const pill of container.querySelectorAll('[contenteditable="false"]')) {
      expect(pill.closest('[data-prompt-markdown]')).toBeNull()
    }
    expect(input.value).toBe(raw)
    expect(container.querySelectorAll('[data-native-chat-skill]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-native-chat-file-reference]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-native-chat-image-reference]')).toHaveLength(1)
  })

  it('updates presentation after edits and undo without adding Markdown document marks', () => {
    const { input, editor, container } = setup('**bold**')
    const before = editor.getJSON()
    act(() => {
      input.setSelectionRange(6, 8)
      editor.commands.deleteSelection()
    })
    expect(input.value).toBe('**bold')
    expect(container.querySelector('[data-prompt-markdown="strong"]')).toBeNull()
    act(() => editor.commands.undo())
    expect(input.value).toBe('**bold**')
    expect(editor.getJSON()).toEqual(before)
    expect(container.querySelector('[data-prompt-markdown="strong"]')).not.toBeNull()
  })

  it('caches decorations through selection-only transactions', () => {
    const { editor, input } = setup('**bold**')
    const cached = promptMarkdownPluginKey.getState(editor.state)
    act(() => input.setSelectionRange(2, 4))
    expect(promptMarkdownPluginKey.getState(editor.state)).toBe(cached)
    act(() => input.insertText!('edit'))
    expect(promptMarkdownPluginKey.getState(editor.state)).not.toBe(cached)
    expect(input.value).toBe('**editld**')
  })

  it('restores raw Markdown and all pill types from the saved draft document', async () => {
    const scope = 'markdown-draft'
    const first = setup('**$rev** [label](https://example.test)', scope)
    await act(async () => first.input.insertSkill!(2, 6, '$review'))
    await act(async () => first.input.insertFileReferences!(['/file`**.ts']))
    await act(async () => first.input.insertText!(' [Image](orca-image:image-1)'))
    const raw = first.input.value
    const document = first.editor.getJSON()
    expect(readNativeChatDraftDocument(scope, raw)).toEqual(document)
    first.unmount()
    const restored = setup(raw, scope)
    await act(async () => {})
    expect(restored.input.value).toBe(raw)
    expect(restored.editor.getJSON()).toEqual(document)
    expect(restored.container.querySelector('[data-native-chat-skill]')).not.toBeNull()
    expect(restored.container.querySelector('[data-native-chat-file-reference]')).not.toBeNull()
    expect(restored.container.querySelector('[data-native-chat-image-reference]')).not.toBeNull()
    expect(restored.container.querySelector('[data-prompt-markdown="strong"]')).not.toBeNull()
  })

  it('defers new decoration wrappers during IME composition and refreshes afterwards', async () => {
    const { textbox, editor, input, container, onChange } = setup('日本')
    fireEvent.compositionStart(textbox)
    act(() =>
      editor.view.dispatch(
        editor.state.tr.insertText('**語**', promptTextPosition(editor.state.doc, 2))
      )
    )
    expect(input.value).toBe('日本**語**')
    expect(container.querySelector('[data-prompt-markdown="strong"]')).toBeNull()
    fireEvent.compositionEnd(textbox)
    await waitFor(() =>
      expect(container.querySelector('[data-prompt-markdown="strong"]')).not.toBeNull()
    )
    expect(input.value).toBe('日本**語**')
    const updates = onChange.mock.calls.length
    await act(async () => new Promise((resolve) => setTimeout(resolve, 60)))
    expect(onChange).toHaveBeenCalledTimes(updates)
  })

  it('keeps oversized pastes exact and plain, then resumes styling after replacement', () => {
    const source = `**large** ${'x'.repeat(PROMPT_MARKDOWN_MAX_SIZE)}`
    const { input, container } = setup(source)
    expect(input.value).toBe(source)
    expect(container.querySelector('[data-prompt-markdown]')).toBeNull()
    act(() => {
      input.value = '**small**'
    })
    expect(input.value).toBe('**small**')
    expect(container.querySelector('[data-prompt-markdown="strong"]')).not.toBeNull()
  })

  it('recovers highlighting when an IME composition is interrupted by blur', async () => {
    const { textbox, editor, input, container } = setup('日本')
    fireEvent.compositionStart(textbox)
    act(() => editor.view.dispatch(editor.state.tr.insertText(' **語**', 3)))
    expect(container.querySelector('[data-prompt-markdown="strong"]')).toBeNull()
    fireEvent.blur(textbox)
    await waitFor(() =>
      expect(container.querySelector('[data-prompt-markdown="strong"]')).not.toBeNull()
    )
    act(() => {
      input.value = '**normal**'
    })
    expect(input.value).toBe('**normal**')
    expect(container.querySelector('[data-prompt-markdown="strong"]')?.textContent).toBe(
      '**normal**'
    )
  })

  it('bounds dense decoration output without losing the pasted source', () => {
    const source = '**x** '.repeat(2_001)
    const { input, container } = setup(source)
    expect(input.value).toBe(source)
    expect(container.querySelector('[data-prompt-markdown]')).toBeNull()
  })

  it.each([
    ['ambiguous brackets', `${'['.repeat(16_000)}${']'.repeat(16_000)}`],
    ['review boundary nested list', `${'- '.repeat(512)}x`],
    ['container budget exceeded', `${'- '.repeat(65)}x`],
    ['deeply nested list', `${'- '.repeat(2_000)}x`],
    ['deeply nested quotes', `${'> '.repeat(2_000)}x`]
  ])('rejects expensive %s before parsing while retaining exact source', (_, source) => {
    const { input, container } = setup(source)
    expect(input.value).toBe(source)
    expect(container.querySelector('[data-prompt-markdown]')).toBeNull()
    act(() => {
      input.value = '**normal**'
    })
    expect(container.querySelector('[data-prompt-markdown="strong"]')?.textContent).toBe(
      '**normal**'
    )
  })

  it('keeps a new composition untouched when it begins before the previous refresh', async () => {
    const { textbox, editor, input, container } = setup('start ')
    fireEvent.compositionStart(textbox)
    act(() => editor.view.dispatch(editor.state.tr.insertText('**one**', 7)))
    fireEvent.compositionEnd(textbox)
    fireEvent.compositionStart(textbox)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 70)))
    expect(container.querySelector('[data-prompt-markdown="strong"]')).toBeNull()
    fireEvent.compositionEnd(textbox)
    await waitFor(() =>
      expect(container.querySelector('[data-prompt-markdown="strong"]')).not.toBeNull()
    )
    expect(input.value).toBe('start **one**')
  })

  it('recovers an interrupted composition even when refocused before refresh', async () => {
    const { textbox, editor, input, container } = setup('start ')
    fireEvent.compositionStart(textbox)
    act(() => editor.view.dispatch(editor.state.tr.insertText('**one**', 7)))
    fireEvent.blur(textbox)
    act(() => input.focus())
    await waitFor(() =>
      expect(promptMarkdownPluginKey.getState(editor.state)?.find().length).toBeGreaterThan(0)
    )
    fireEvent.compositionEnd(textbox)
    await waitFor(() =>
      expect(container.querySelector('[data-prompt-markdown="strong"]')).not.toBeNull()
    )
    expect(input.value).toBe('start **one**')
  })

  it('cancels a pending composition refresh when the editor is destroyed', async () => {
    const { textbox, editor, unmount } = setup('**one**')
    fireEvent.compositionStart(textbox)
    fireEvent.compositionEnd(textbox)
    const dispatch = vi.spyOn(editor.view, 'dispatch')
    unmount()
    const calls = dispatch.mock.calls.length
    await act(async () => new Promise((resolve) => setTimeout(resolve, 70)))
    expect(dispatch).toHaveBeenCalledTimes(calls)
  })
})
