export type UsageStep = { operationId: string };
export function mergeUsagePages<
  T extends { session: { sessionGroupId: string }; steps: UsageStep[] },
>(current: T, incoming: T): T {
  if (current.session.sessionGroupId !== incoming.session.sessionGroupId) {
    throw new Error("SESSION_PAGE_MISMATCH");
  }
  return {
    ...incoming,
    steps: [
      ...new Map(
        [...current.steps, ...incoming.steps].map((step) => [
          step.operationId,
          step,
        ])
      ).values(),
    ],
  };
}
export class UsageRequestScope {
  private version = 0;
  private controller: AbortController | undefined;
  begin() {
    this.controller?.abort();
    this.controller = new AbortController();
    this.version += 1;
    const { version } = this;
    return {
      current: () =>
        version === this.version && !this.controller?.signal.aborted,
      signal: this.controller.signal,
    };
  }
  cancel() {
    this.version += 1;
    this.controller?.abort();
  }
}
