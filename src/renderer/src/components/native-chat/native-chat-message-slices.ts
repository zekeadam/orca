import type { NativeChatBlock, NativeChatMessage } from '../../../../shared/native-chat-types'
import { pairToolBlocks } from '../../../../shared/native-chat-tool-pairs'

function isNotice(block: NativeChatBlock): boolean {
  return (
    block.type === 'text' &&
    (block.providerFrame !== undefined ||
      block.presentation !== undefined ||
      block.tone !== undefined ||
      block.failure !== undefined ||
      block.contextClear !== undefined ||
      block.orcaStop !== undefined)
  )
}

/** Preserve block order when a provider notice shares its message with actual prose or tools. */
export function nativeChatMessageSlices(message: NativeChatMessage): NativeChatMessage[] | null {
  if (message.role === 'user' || message.blocks.length < 2) {
    return null
  }
  const slices: NativeChatMessage[] = []
  // A result belongs to its call's card even when prose or a notice arrived between them.
  const results = new Map(
    pairToolBlocks(message.blocks).flatMap(({ call, result }) =>
      call && result ? [[call, result] as const] : []
    )
  )
  const pairedResults = new Set(results.values())
  let plain: NativeChatBlock[] = []
  let start = 0
  let hasTool = false
  const flush = (): void => {
    if (plain.length === 0) {
      return
    }
    slices.push({
      ...message,
      id: start === 0 ? message.id : `${message.id}:block:${start}`,
      blocks: plain
    })
    plain = []
    hasTool = false
  }
  for (const [index, block] of message.blocks.entries()) {
    if (block.type === 'tool-result' && pairedResults.has(block)) {
      continue
    }
    if (isNotice(block)) {
      flush()
      slices.push({
        ...message,
        id: index === 0 ? message.id : `${message.id}:block:${index}`,
        blocks: [block]
      })
    } else {
      if (hasTool && (block.type === 'text' || block.type === 'image-ref')) {
        flush()
      }
      if (plain.length === 0) {
        start = index
      }
      plain.push(block)
      if (block.type === 'tool-call') {
        const result = results.get(block)
        if (result) {
          plain.push(result)
        }
      }
      hasTool ||= block.type === 'tool-call' || block.type === 'tool-result'
    }
  }
  flush()
  return slices.length > 1 ? slices : null
}
