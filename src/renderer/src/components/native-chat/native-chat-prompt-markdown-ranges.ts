import type { Nodes, Root } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

const parser = unified().use(remarkParse).use(remarkGfm)
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/
const MAX_SYNTAX_CHARACTERS = 256
const MAX_CONTAINER_MARKERS = 64

export type PromptMarkdownRange = { from: number; to: number; kind: string; className: string }

const styles = {
  heading: 'text-sm font-semibold text-chat-foreground-strong',
  strong: 'font-semibold text-chat-foreground-strong',
  emphasis: 'italic',
  delete: 'line-through',
  inlineCode: 'font-mono text-chat-code bg-muted rounded',
  code: 'font-mono text-chat-code bg-muted',
  link: 'underline underline-offset-2',
  linkReference: 'underline underline-offset-2',
  listItem: 'font-medium text-chat-foreground-strong',
  blockquote: 'font-medium text-chat-foreground-strong'
} as const

function hasStyle(kind: string): kind is keyof typeof styles {
  return Object.hasOwn(styles, kind)
}

export function promptMarkdownRanges(source: string): PromptMarkdownRange[] {
  const ranges: PromptMarkdownRange[] = []
  let syntaxCharacters = 0
  // Bound ambiguous delimiters and container nesting before remark can do expensive work.
  for (const character of source) {
    if (ASCII_PUNCTUATION.test(character) && ++syntaxCharacters > MAX_SYNTAX_CHARACTERS) {
      return ranges
    }
  }
  if ((source.match(/[-+*.)](?=\s|$)|>/g)?.length ?? 0) > MAX_CONTAINER_MARKERS) {
    return ranges
  }
  let tree: Root
  try {
    tree = parser.parse(source)
  } catch {
    // A malformed or deeply nested paste must never block editing or sending its source.
    return ranges
  }
  const pending: Nodes[] = [tree]
  while (pending.length > 0) {
    const node = pending.pop()!
    const position = 'position' in node ? node.position : undefined
    const from = position?.start.offset
    const to = position?.end.offset
    if (from !== undefined && to !== undefined && hasStyle(node.type)) {
      const kind = node.type
      const className = styles[kind]
      if (kind === 'listItem' || kind === 'blockquote') {
        const marker =
          kind === 'listItem'
            ? /^[ \t]*(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/
            : /^[ \t]*>[ \t]?/gm
        for (const match of source.slice(from, to).matchAll(new RegExp(marker.source, 'gm'))) {
          ranges.push({
            from: from + match.index,
            to: from + match.index + match[0].length,
            kind,
            className
          })
          if (kind === 'listItem') {
            break
          }
        }
      } else {
        ranges.push({ from, to, kind, className })
      }
    }
    if (ranges.length > 2_000) {
      return []
    }
    // Code and HTML stay opaque; none of their contents become executable DOM.
    if ('children' in node) {
      pending.push(...node.children)
    }
  }
  return ranges
}
