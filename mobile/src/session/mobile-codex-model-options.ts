import type { AgentSessionModelCatalogResult } from '../../../src/shared/agent-session-wire'
import type { SessionOptionDescriptor } from '../../../src/shared/native-chat-session-options'
import type { ConfirmedMobileCodexModelSelection } from './mobile-codex-model-selection'

/** The existing graphical drawer reads host catalog choices and confirmed session values. */
export function buildMobileCodexModelOptions(
  catalog: Extract<AgentSessionModelCatalogResult, { models: unknown }> | null,
  modelId: string | null,
  chosen: ConfirmedMobileCodexModelSelection | null
): SessionOptionDescriptor[] {
  const model = catalog?.models.find((entry) => entry.id === modelId)
  return [
    {
      id: 'model',
      label: 'Model',
      category: 'model',
      kind: {
        type: 'select',
        choices:
          catalog?.models.map((entry) => ({
            value: entry.id,
            label: entry.label,
            description: entry.description
          })) ?? [],
        ...(modelId ? { currentValue: modelId } : {})
      },
      settable: !!catalog?.models.length,
      valueSource: modelId ? 'reported' : 'unknown',
      transport: 'catalog'
    },
    ...(model && model.efforts.length > 1
      ? [
          {
            id: 'effort',
            label: 'Reasoning effort',
            category: 'thought_level' as const,
            kind: {
              type: 'select' as const,
              choices: model.efforts,
              ...(chosen ? { currentValue: chosen.effort } : {})
            },
            settable: true,
            valueSource: chosen ? ('reported' as const) : ('unknown' as const),
            transport: 'catalog' as const
          }
        ]
      : [])
  ]
}
