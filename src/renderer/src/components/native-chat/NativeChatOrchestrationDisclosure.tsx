import { ChevronRight, Mail } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { useNativeChatDisclosure } from './native-chat-disclosure-store'

export function NativeChatOrchestrationDisclosure({
  messageId,
  enabled,
  children
}: {
  messageId: string
  enabled: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const disclosure = useNativeChatDisclosure(`orchestration:${messageId}`, false)
  if (!enabled) {
    return <>{children}</>
  }
  return (
    <Collapsible open={disclosure.open} onOpenChange={disclosure.setOpen}>
      <CollapsibleTrigger variant="transcript" className="group/orchestration">
        <Mail aria-hidden="true" className="size-4 shrink-0" />
        <span>
          {translate('components.native-chat.orchestrationNotice', 'Orchestration notice')}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform motion-reduce:transition-none group-data-[state=open]/orchestration:rotate-90"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}
