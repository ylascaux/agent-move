import type { AgentStateManager } from '../state/agent-state-manager.js';
import type { AgentWatcher } from '../watcher/agent-watcher.js';

/**
 * Pushes this node's local AgentMove snapshot to a central hub.
 *
 * Only local state is published: remote state aggregated by this node is never
 * forwarded, preventing hub/collector loops.
 */
export class PushSourcePublisher implements AgentWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private inFlight = false;

  constructor(
    private stateManager: AgentStateManager,
    private hubUrl: string,
    private nodeId: string,
    private nodeName: string,
    private token = '',
    private intervalMs = 1000,
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    await this.push();
    this.timer = setInterval(() => void this.push(), this.intervalMs);
    console.log(`[push:${this.nodeId}] Publishing local state to ${this.hubUrl} every ${this.intervalMs}ms`);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async push(): Promise<void> {
    if (this.stopped || this.inFlight) return;
    this.inFlight = true;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(this.intervalMs, 5000));
      try {
        const headers: Record<string, string> = {
          'content-type': 'application/json',
        };
        if (this.token) headers.authorization = `Bearer ${this.token}`;

        const response = await fetch(
          `${this.hubUrl.replace(/\/$/, '')}/api/ingest/${encodeURIComponent(this.nodeId)}`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              name: this.nodeName,
              agents: this.stateManager.getAll(),
              timestamp: Date.now(),
            }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      console.warn(
        `[push:${this.nodeId}] Publish failed:`,
        err instanceof Error ? err.message : err,
      );
    } finally {
      this.inFlight = false;
    }
  }
}
