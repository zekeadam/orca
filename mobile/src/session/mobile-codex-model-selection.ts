export type ConfirmedMobileCodexModelSelection = {
  scope: string | null
  model: string
  effort: string
  reportedModelAtSelection: string | null
  reportAcknowledged: boolean
}

/** A fresh host model supersedes local confirmation once the host has caught up. */
export function reconcileMobileCodexModelSelection(
  confirmed: ConfirmedMobileCodexModelSelection | null,
  scope: string | null,
  reportedModel: string | null
): ConfirmedMobileCodexModelSelection | null {
  if (!confirmed || confirmed.scope !== scope || !reportedModel) {
    return confirmed
  }
  if (reportedModel === confirmed.model) {
    return confirmed.reportAcknowledged ? confirmed : { ...confirmed, reportAcknowledged: true }
  }
  // Keep the pre-command report while it is stale, including before the host's first echo.
  return confirmed.reportAcknowledged ||
    (confirmed.reportedModelAtSelection !== null &&
      reportedModel !== confirmed.reportedModelAtSelection)
    ? null
    : confirmed
}
