import { EventEmitter } from 'events';
import type { AgentEvent, AgentState } from '@agent-move/shared';

/**
 * Keeps remote AgentMove snapshots separate from the local state machine.
 * Remote agent ids are namespaced so two hosts can safely expose identical
 * underlying session ids.
 */
export class RemoteAgentStore extends EventEmitter {
  private agents = new Map<string, AgentState>();
  private sourceAgents = new Map<string, Set<string>>();
  private sourceLastSeen = new Map<string, number>();
  private expiryTimer: ReturnType<typeof setInterval> | null = null;

  getAll(): AgentState[] {
    return Array.from(this.agents.values());
  }

  replaceSource(sourceId: string, sourceName: string, incoming: AgentState[]): void {
    const previousIds = this.sourceAgents.get(sourceId) ?? new Set<string>();
    const nextIds = new Set<string>();
    const now = Date.now();

    this.sourceLastSeen.set(sourceId, now);

    for (const raw of incoming) {
      const agent = this.namespaceAgent(sourceId, sourceName, raw);
      nextIds.add(agent.id);
      const previous = this.agents.get(agent.id);
      this.agents.set(agent.id, agent);

      if (!previous) {
        this.emit('agent:spawn', {
          type: 'agent:spawn',
          agent: { ...agent },
          timestamp: now,
        } satisfies AgentEvent);
      } else if (JSON.stringify(previous) !== JSON.stringify(agent)) {
        this.emit('agent:update', {
          type: 'agent:update',
          agent: { ...agent },
          timestamp: now,
        } satisfies AgentEvent);
      }
    }

    for (const staleId of previousIds) {
      if (nextIds.has(staleId)) continue;
      const stale = this.agents.get(staleId);
      this.agents.delete(staleId);
      if (stale) {
        this.emit('agent:shutdown', {
          type: 'agent:shutdown',
          agent: { ...stale },
          timestamp: now,
        } satisfies AgentEvent);
      }
    }

    this.sourceAgents.set(sourceId, nextIds);
  }

  clearSource(sourceId: string): void {
    const ids = this.sourceAgents.get(sourceId);
    const now = Date.now();

    if (ids) {
      for (const id of ids) {
        const agent = this.agents.get(id);
        this.agents.delete(id);
        if (agent) {
          this.emit('agent:shutdown', {
            type: 'agent:shutdown',
            agent: { ...agent },
            timestamp: now,
          } satisfies AgentEvent);
        }
      }
    }

    this.sourceAgents.delete(sourceId);
    this.sourceLastSeen.delete(sourceId);
  }

  startExpiry(ttlMs: number): void {
    this.stopExpiry();
    const intervalMs = Math.max(1000, Math.min(5000, Math.floor(ttlMs / 3)));
    this.expiryTimer = setInterval(() => this.expireStale(ttlMs), intervalMs);
  }

  stopExpiry(): void {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
    this.expiryTimer = null;
  }

  expireStale(ttlMs: number): void {
    const cutoff = Date.now() - ttlMs;
    for (const [sourceId, lastSeen] of this.sourceLastSeen) {
      if (lastSeen < cutoff) {
        console.warn(`[remote:${sourceId}] Snapshot expired after ${ttlMs}ms without refresh`);
        this.clearSource(sourceId);
      }
    }
  }

  private namespaceAgent(sourceId: string, sourceName: string, raw: AgentState): AgentState {
    const prefix = `remote:${sourceId}:`;
    const ns = (id: string | null): string | null => id ? `${prefix}${id}` : null;
    const inferredOpenCodeSource = this.inferOpenCodeSource(raw.id);

    const childSourceId = raw.source?.id && raw.source.id !== 'local'
      ? raw.source.id
      : inferredOpenCodeSource;
    const childSourceName = raw.source?.name && raw.source.name !== 'Local'
      ? raw.source.name
      : inferredOpenCodeSource;

    const nestedSource = childSourceId ? `${sourceId}/${childSourceId}` : sourceId;
    const nestedName = childSourceName ? `${sourceName} / ${childSourceName}` : sourceName;

    return {
      ...raw,
      id: ns(raw.id)!,
      sessionId: ns(raw.sessionId)!,
      rootSessionId: ns(raw.rootSessionId)!,
      parentId: ns(raw.parentId),
      source: {
        id: nestedSource,
        name: nestedName,
        kind: 'remote',
        runtime: raw.source?.runtime || 'docker',
      },
    };
  }

  /** Extract source from the explicit OpenCode id format: oc:<source>:<session>. */
  private inferOpenCodeSource(agentId: string): string | null {
    const match = agentId.match(/^oc:([^:]+):.+$/);
    return match?.[1] ?? null;
  }
}
