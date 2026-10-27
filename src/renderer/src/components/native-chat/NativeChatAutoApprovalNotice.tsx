import { Check, ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import type { NativeChatMessage, NativeChatTextBlock } from '../../../../shared/native-chat-types'
import { ProviderFrameRow } from './NativeChatTranscriptChrome'
import { useNativeChatDisclosure } from './native-chat-disclosure-store'

export { isNativeChatAutoApprovalNotice } from '../../../../shared/native-chat-auto-approval'

export function NativeChatAutoApprovalMessage({
  message
}: {
  message: NativeChatMessage
}): React.JSX.Element {
  const seen = new Map<string, number>()
  let first = true
  return (
    <>
      {message.blocks.flatMap((block) => {
        if (block.type !== 'text') {
          return []
        }
        const digest = block.providerFrame?.payload.digest ?? block.text
        const occurrence = seen.get(digest) ?? 0
        seen.set(digest, occurrence + 1)
        const key = first ? message.id : `${message.id}:${digest}:${occurrence}`
        first = false
        return [<NativeChatAutoApprovalNotice key={key} block={block} messageId={key} />]
      })}
    </>
  )
}

export function NativeChatAutoApprovalNotice({
  block,
  messageId
}: {
  block: NativeChatTextBlock
  messageId?: string
}): React.JSX.Element {
  const disclosure = useNativeChatDisclosure(
    messageId === undefined ? undefined : `auto-approval:${messageId}`,
    false
  )
  return (
    <Collapsible open={disclosure.open} onOpenChange={disclosure.setOpen}>
      <CollapsibleTrigger variant="transcript" className="group/auto-approval">
        <Check aria-hidden="true" className="size-4 shrink-0" />
        <span>
          {translate(
            'components.native-chat.notices.autoApprovalGranted',
            'Automatic approval granted'
          )}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform motion-reduce:transition-none group-data-[state=open]/auto-approval:rotate-90"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2 rounded-md border border-border bg-muted/20 p-3 text-sm text-chat-foreground">
          <p className="whitespace-pre-wrap break-words">{block.text}</p>
          <ProviderFrameRow
            block={block}
            summary={translate('components.native-chat.notices.details', 'Details')}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
