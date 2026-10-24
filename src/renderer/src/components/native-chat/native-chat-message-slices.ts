import type { NativeChatBlock, NativeChatMessage } from '../../../../shared/native-chat-types'

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
      hasTool ||= block.type === 'tool-call' || block.type === 'tool-result'
    }
  }
  flush()
  return slices.length > 1 ? slices : null
}
