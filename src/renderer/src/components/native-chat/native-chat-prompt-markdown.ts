import { Extension } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { promptMarkdownRanges } from './native-chat-prompt-markdown-ranges'

// Presentation has a fixed budget; oversized prompts remain fully editable plain text.
export const PROMPT_MARKDOWN_MAX_SIZE = 32_768
const MAX_DECORATIONS = 2_000
export const promptMarkdownPluginKey = new PluginKey<DecorationSet>('nativeChatPromptMarkdown')

type TextSpan = { from: number; to: number; position: number }

function projectPrompt(doc: ProseMirrorNode): { source: string; spans: TextSpan[] } {
  const parts: string[] = []
  const spans: TextSpan[] = []
  let offset = 0
  doc.forEach((block, blockPosition, index) => {
    if (index > 0) {
      parts.push('\n')
      offset++
    }
    block.forEach((node, position) => {
      if (node.isText && node.text) {
        spans.push({
          from: offset,
          to: offset + node.text.length,
          position: blockPosition + position + 1
        })
        parts.push(node.text)
        offset += node.text.length
      } else {
        // Atom tokens may contain Markdown or newlines; only their neutral boundary is parsed.
        parts.push(node.type.name === 'hardBreak' ? '\n' : '\ufffc')
        offset++
      }
    })
  })
  return { source: parts.join(''), spans }
}

export function promptMarkdownDecorations(doc: ProseMirrorNode): DecorationSet {
  if (doc.content.size > PROMPT_MARKDOWN_MAX_SIZE) {
    return DecorationSet.empty
  }
  const { source, spans } = projectPrompt(doc)
  const decorations: Decoration[] = []
  for (const range of promptMarkdownRanges(source)) {
    // Find the first intersecting text span without rescanning every preceding paragraph.
    let low = 0
    let high = spans.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (spans[middle].to <= range.from) {
        low = middle + 1
      } else {
        high = middle
      }
    }
    for (let index = low; index < spans.length && spans[index].from < range.to; index++) {
      const span = spans[index]
      decorations.push(
        Decoration.inline(
          span.position + Math.max(range.from - span.from, 0),
          span.position + Math.min(range.to, span.to) - span.from,
          { class: range.className, 'data-prompt-markdown': range.kind }
        )
      )
      if (decorations.length > MAX_DECORATIONS) {
        return DecorationSet.empty
      }
    }
  }
  return DecorationSet.create(doc, decorations)
}

export const NativeChatPromptMarkdown = Extension.create({
  name: 'nativeChatPromptMarkdown',
  addProseMirrorPlugins() {
    let composing = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const refreshAfterComposition = (view: EditorView, interrupted = false): void => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (view.isDestroyed) {
          return
        }
        if (!interrupted && view.composing && view.hasFocus()) {
          refreshAfterComposition(view)
          return
        }
        composing = false
        view.dispatch(
          view.state.tr.setMeta(promptMarkdownPluginKey, true).setMeta('addToHistory', false)
        )
      }, 50)
    }
    return [
      new Plugin<DecorationSet>({
        key: promptMarkdownPluginKey,
        state: {
          init: (_, state) => promptMarkdownDecorations(state.doc),
          apply: (transaction, cached) => {
            if (transaction.getMeta(promptMarkdownPluginKey)) {
              return promptMarkdownDecorations(transaction.doc)
            }
            if (!transaction.docChanged) {
              return cached
            }
            // Mapping keeps the composition's DOM stable until ProseMirror finishes the IME edit.
            return composing
              ? cached.map(transaction.mapping, transaction.doc)
              : promptMarkdownDecorations(transaction.doc)
          }
        },
        props: {
          decorations: (state) => promptMarkdownPluginKey.getState(state),
          handleDOMEvents: {
            compositionstart: () => {
              clearTimeout(timer)
              composing = true
              return false
            },
            compositionend: (view) => {
              refreshAfterComposition(view)
              return false
            },
            blur: (view) => {
              if (composing) {
                // Blur ends this gesture even if focus returns before the refresh.
                refreshAfterComposition(view, true)
              }
              return false
            }
          }
        },
        view: () => ({ destroy: () => clearTimeout(timer) })
      })
    ]
  }
})
