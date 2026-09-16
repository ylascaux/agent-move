import type { AgentState } from '@agent-move/shared';
import type { AgentWatcher } from '../watcher/agent-watcher.js';
import type { RemoteAgentStore } from './remote-agent-store.js';

interface RemoteStateResponse {
  agents?: AgentState[];
}

/** Polls another AgentMove node's /api/state endpoint. */
export class RemoteSourceWatcher implements AgentWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private inFlight = false;

  constructor(
    private sourceId: string,
    private baseUrl: string,
    private store: RemoteAgentStore,
    private pollMs = 1000,
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    await this.poll();
    this.timer = setInterval(() => void this.poll(), this.pollMs);
    console.log(`[remote:${this.sourceId}] Polling ${this.baseUrl}/api/state every ${this.pollMs}ms`);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.store.clearSource(this.sourceId);
  }

  private async poll(): Promise<void> {
    if (this.stopped || this.inFlight) return;
    this.inFlight = true;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(this.pollMs, 3000));
      try {
        const response = await fetch(`${this.baseUrl}/api/state`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json() as RemoteStateResponse;
        this.store.replaceSource(this.sourceId, this.sourceId, payload.agents ?? []);
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      // Keep the last known snapshot during transient network failures.
      console.warn(`[remote:${this.sourceId}] Poll failed:`, err instanceof Error ? err.message : err);
    } finally {
      this.inFlight = false;
    }
  }
}
