import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '../../../src/renderer/src/components/ui/button'
import { NativeChatMessageList } from '../../../src/renderer/src/components/native-chat/NativeChatMessageList'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import './fixture.css'

function prose(
  id: string,
  text: string,
  role: NativeChatMessage['role'] = 'assistant'
): NativeChatMessage {
  return {
    id,
    role,
    blocks: [{ type: 'text', text }],
    timestamp: 1000,
    source: 'transcript',
    turnId: 'turn-1'
  }
}
function call(id: string): NativeChatMessage {
  return {
    ...prose(id, ''),
    blocks: [
      {
        type: 'tool-call',
        name: 'shell',
        input: { command: `echo ${id}` },
        callId: id,
        state: 'completed'
      },
      { type: 'tool-result', callId: id, output: `Output ${id}` }
    ]
  }
}
function approval(id: string): NativeChatMessage {
  return {
    ...prose(id, '', 'system'),
    blocks: [
      {
        type: 'text',
        tone: 'warning',
        text: 'Automatic approval review approved (shell): synthetic safe command',
        providerFrame: {
          provider: 'codex',
          kind: 'notification:warning',
          payload: { head: '{}', byteLength: 2, digest: 'fixture', truncated: false }
        }
      }
    ]
  }
}
const notice: NativeChatMessage = {
  ...prose(
    'mail',
    'You have 1 orchestration message. Run `orca-dev orchestration check --run run_fixture`.',
    'user'
  ),
  from: {
    kind: 'agent',
    senders: [],
    orchestration: {
      message: 'mail-notice',
      mailbox: 'fixture',
      dispatchId: null,
      messages: [{ messageId: 'm1', runId: 'run_fixture', from: 'dispatch:fixture' }]
    }
  }
}
const messages: NativeChatMessage[] = [
  notice,
  prose('user', 'Review the synthetic project', 'user'),
  prose('before', 'I am checking the requested change.'),
  call('first'),
  approval('approval-1'),
  {
    ...prose('thought', 'Synthetic reasoning detail', 'reasoning'),
    state: 'completed',
    completedAt: 2000
  },
  call('second'),
  approval('approval-2'),
  call('third'),
  prose('after', 'The requested change is ready to review.')
]
const orderedMessages = messages.map((message, index) => ({
  ...message,
  timestamp: 1000 + index * 1000
}))
function Fixture(): React.JSX.Element {
  const [appended, setAppended] = useState(false)
  return (
    <main className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 text-sm">
        <span>Chat activity · synthetic evidence</span>
        <Button variant="ghost" size="sm" onClick={() => setAppended(true)}>
          Append activity
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <NativeChatMessageList
          session={{
            agent: 'codex',
            sessionId: 'chat-activity-proof',
            status: 'ready',
            messages: appended
              ? [
                  ...orderedMessages.slice(0, -1),
                  { ...call('streamed'), timestamp: 9500 },
                  orderedMessages.at(-1)!
                ]
              : orderedMessages,
            hasMore: false,
            loadingEarlier: false,
            loadEarlier: () => Promise.resolve('exhausted' as const),
            readPhase: 'ready'
          }}
          isWorking={false}
          expandSignal={false}
          fontScale={1}
        />
      </div>
    </main>
  )
}
const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing fixture root')
}
createRoot(root).render(<Fixture />)
