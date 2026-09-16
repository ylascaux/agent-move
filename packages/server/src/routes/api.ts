import { timingSafeEqual } from 'crypto';
import type { FastifyInstance } from 'fastify';
import type { AgentState } from '@agent-move/shared';
import type { AgentStateManager } from '../state/agent-state-manager.js';
import type { RemoteAgentStore } from '../remote/remote-agent-store.js';

interface IngestBody {
  name?: string;
  agents?: AgentState[];
  timestamp?: number;
}

function bearerAuthorized(header: string | undefined, token: string): boolean {
  if (!token) return true;
  if (!header) return false;

  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function registerApiRoutes(
  app: FastifyInstance,
  stateManager: AgentStateManager,
  remoteStore?: RemoteAgentStore,
  ingestToken = '',
) {
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  app.get('/api/state', async () => {
    return {
      agents: [...stateManager.getAll(), ...(remoteStore?.getAll() ?? [])],
      timestamp: Date.now(),
    };
  });

  app.get('/api/sources', async () => {
    return {
      sources: remoteStore?.getSources() ?? [],
      timestamp: Date.now(),
    };
  });

  /**
   * Collector push endpoint. Nodes only need outbound HTTP(S) access to the hub.
   * Configure AGENT_MOVE_INGEST_TOKEN on the hub and the same value as
   * AGENT_MOVE_PUSH_TOKEN on collectors to require Bearer authentication.
   */
  app.post<{ Params: { sourceId: string }; Body: IngestBody }>(
    '/api/ingest/:sourceId',
    async (req, reply) => {
      if (!remoteStore) {
        return reply.status(503).send({ error: 'Remote ingestion is unavailable' });
      }

      if (!bearerAuthorized(req.headers.authorization, ingestToken)) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const sourceId = req.params.sourceId;
      if (!/^[a-zA-Z0-9._-]+$/.test(sourceId)) {
        return reply.status(400).send({ error: 'Invalid source id' });
      }

      const agents = req.body?.agents;
      if (!Array.isArray(agents)) {
        return reply.status(400).send({ error: 'agents must be an array' });
      }

      const sourceName = typeof req.body?.name === 'string' && req.body.name.trim()
        ? req.body.name.trim().slice(0, 80)
        : sourceId;

      remoteStore.replaceSource(sourceId, sourceName, agents);
      return reply.status(202).send({
        accepted: true,
        sourceId,
        agents: agents.length,
        timestamp: Date.now(),
      });
    },
  );

  /** POST /api/agents/clean-done – Remove all local agents marked as done */
  app.post('/api/agents/clean-done', async () => {
    const removed = stateManager.removeDone();
    return { removed, count: removed.length };
  });

  /** POST /api/agents/:id/shutdown – Remove a single local agent by id */
  app.post<{ Params: { id: string } }>('/api/agents/:id/shutdown', async (req, reply) => {
    const agent = stateManager.getAll().find(a => a.id === req.params.id);
    if (!agent) {
      return reply.status(404).send({ error: 'Local agent not found' });
    }
    stateManager.shutdown(req.params.id);
    return { removed: req.params.id };
  });
}
