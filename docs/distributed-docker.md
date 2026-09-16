# Distributed AgentMove with Docker

AgentMove can run as the same Docker image on every machine.

- A **collector** reads local Claude Code, Codex CLI and/or OpenCode session storage through read-only mounts.
- A **hub** exposes the AgentMove web UI and receives snapshots pushed by collectors.
- Collectors need **outbound HTTP(S) access to the hub only**. They do not need an inbound AgentMove port.
- Collectors never need the Docker socket and never connect to the OpenCode/Claude/Codex process itself.

The recommended topology is:

```text
work laptop collector ──┐
server collector ───────┼── HTTPS push ──> AgentMove hub ──> Web UI :3333
personal collector ─────┘
```

The older pull mode remains available through `AGENT_MOVE_REMOTE_SOURCES`, but push mode is preferred for machines behind NAT, corporate firewalls or VPNs.

## Start the hub

Copy the example Compose file and run only the hub service:

```bash
cp docker-compose.example.yml docker-compose.yml
export AGENT_MOVE_INGEST_TOKEN='replace-with-a-long-random-secret'
docker compose up -d --build hub
```

Open `http://localhost:3333` to access the aggregated AgentMove UI.

For a remote/shared hub, put the service behind HTTPS and keep the ingest token enabled.

## Start a collector

On each machine, give the collector a stable identity and the hub URL:

```yaml
environment:
  AGENT_MOVE_NODE_ID: work-laptop
  AGENT_MOVE_NODE_NAME: Work laptop
  AGENT_MOVE_PUSH_URL: https://agentmove.example.com
  AGENT_MOVE_PUSH_TOKEN: ${AGENT_MOVE_INGEST_TOKEN}
  AGENT_MOVE_PUSH_INTERVAL_MS: 1000
```

Do not publish the collector's port. It only needs outbound access to the hub.

```bash
export AGENT_MOVE_INGEST_TOKEN='same-secret-as-the-hub'
export AGENT_MOVE_PUSH_URL='https://agentmove.example.com'
docker compose up -d --build collector
```

The collector POSTs its **local** AgentMove snapshot to:

```text
POST /api/ingest/<node-id>
Authorization: Bearer <token>
```

Remote snapshots are namespaced by the hub as `remote:<node-id>:...` so session IDs from different machines cannot collide.

If a collector stops refreshing its snapshot, the hub removes it after `AGENT_MOVE_REMOTE_TTL_MS` (15 seconds by default).

## Select collectors with mounts

### OpenCode on the host

```yaml
environment:
  AGENT_MOVE_OPENCODE: "true"
  AGENT_MOVE_OPENCODE_SOURCES: "local=/sources/opencode/opencode.db"
volumes:
  - ${HOME}/.local/share/opencode:/sources/opencode:ro
```

The whole OpenCode directory is mounted because AgentMove watches `opencode.db-wal` next to the database.

### Claude Code on the host

```yaml
environment:
  AGENT_MOVE_CLAUDE: "true"
  AGENT_MOVE_CLAUDE_HOME: /sources/claude
volumes:
  - ${HOME}/.claude:/sources/claude:ro
```

Docker mode reads JSONL session files. It deliberately starts the server directly rather than the CLI wrapper, so it does not attempt to install Claude hooks into the read-only mount.

### Codex CLI on the host

```yaml
environment:
  AGENT_MOVE_CODEX: "true"
  AGENT_MOVE_CODEX_SESSIONS: /sources/codex/sessions
volumes:
  - ${HOME}/.codex/sessions:/sources/codex/sessions:ro
```

### OpenCode in another Docker container

Mount the same persistent volume into AgentMove as read-only. Do **not** mount `/var/run/docker.sock`.

```yaml
services:
  collector:
    environment:
      AGENT_MOVE_OPENCODE: "true"
      AGENT_MOVE_OPENCODE_SOURCES: >-
        staging-1=/sources/staging-1/opencode.db,
        staging-2=/sources/staging-2/opencode.db
    volumes:
      - opencode-staging-1:/sources/staging-1:ro
      - opencode-staging-2:/sources/staging-2:ro

volumes:
  opencode-staging-1:
    external: true
    name: actual_compose_volume_name_1
  opencode-staging-2:
    external: true
    name: actual_compose_volume_name_2
```

Each explicit OpenCode source namespaces its session IDs, for example `oc:staging-1:<session-id>`. When pushed through a server collector, the hub preserves that nested identity as `server/staging-1`.

## Example: work laptop

```yaml
environment:
  AGENT_MOVE_NODE_ID: work-laptop
  AGENT_MOVE_NODE_NAME: Work laptop
  AGENT_MOVE_PUSH_URL: https://agentmove.example.com
  AGENT_MOVE_PUSH_TOKEN: ${AGENT_MOVE_INGEST_TOKEN}

  AGENT_MOVE_OPENCODE: "true"
  AGENT_MOVE_OPENCODE_SOURCES: local=/sources/opencode/opencode.db
  AGENT_MOVE_CLAUDE: "true"
  AGENT_MOVE_CLAUDE_HOME: /sources/claude
  AGENT_MOVE_CODEX: "true"
  AGENT_MOVE_CODEX_SESSIONS: /sources/codex/sessions

volumes:
  - ${HOME}/.local/share/opencode:/sources/opencode:ro
  - ${HOME}/.claude:/sources/claude:ro
  - ${HOME}/.codex/sessions:/sources/codex/sessions:ro
```

No `ports:` block is required for this collector.

## Example: server with multiple OpenCode workers

```yaml
environment:
  AGENT_MOVE_NODE_ID: livalyo-server
  AGENT_MOVE_NODE_NAME: Livalyo server
  AGENT_MOVE_PUSH_URL: https://agentmove.example.com
  AGENT_MOVE_PUSH_TOKEN: ${AGENT_MOVE_INGEST_TOKEN}

  AGENT_MOVE_OPENCODE: "true"
  AGENT_MOVE_OPENCODE_SOURCES: >-
    staging-1=/sources/staging-1/opencode.db,
    staging-2=/sources/staging-2/opencode.db,
    prod-1=/sources/prod-1/opencode.db
```

The hub will distinguish the agents as coming from `livalyo-server/staging-1`, `livalyo-server/staging-2`, `livalyo-server/prod-1`, and so on.

## Security

Use HTTPS when collectors push across machines or networks. Configure:

```text
Hub:       AGENT_MOVE_INGEST_TOKEN=<secret>
Collector: AGENT_MOVE_PUSH_TOKEN=<same secret>
```

When `AGENT_MOVE_INGEST_TOKEN` is set, `/api/ingest/:sourceId` rejects requests without the matching Bearer token.

The normal AgentMove web UI/API itself is not an authentication boundary. If the hub is reachable from an untrusted network, put it behind an authenticated reverse proxy, VPN or Zero Trust access layer.

## Legacy pull mode

Pull aggregation remains supported for compatibility:

```yaml
environment:
  AGENT_MOVE_REMOTE_SOURCES: >-
    work=http://work-agent-move:3333,
    server=http://server-agent-move:3333
  AGENT_MOVE_REMOTE_POLL_MS: 1000
```

This requires the hub to reach every node inbound, so it is no longer the recommended deployment.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `AGENT_MOVE_HOST` | Listen address. Hub Docker normally uses `0.0.0.0`; collectors can use `127.0.0.1`. |
| `AGENT_MOVE_PORT` | HTTP/UI port, default `3333`. |
| `AGENT_MOVE_CLAUDE` | Enable Claude watcher. |
| `AGENT_MOVE_CLAUDE_HOME` | Mounted Claude home, e.g. `/sources/claude`. |
| `AGENT_MOVE_OPENCODE` | Enable OpenCode watcher. |
| `AGENT_MOVE_OPENCODE_SOURCES` | Comma-separated `id=/path/opencode.db` list. |
| `AGENT_MOVE_CODEX` | Enable Codex watcher. |
| `AGENT_MOVE_CODEX_SESSIONS` | Mounted Codex sessions directory. |
| `AGENT_MOVE_PI` | Enable pi watcher. |
| `AGENT_MOVE_NODE_ID` | Stable collector ID used for remote namespacing. |
| `AGENT_MOVE_NODE_NAME` | Human-readable collector name. |
| `AGENT_MOVE_PUSH_URL` | Hub base URL used by a collector for outbound push. |
| `AGENT_MOVE_PUSH_TOKEN` | Bearer token sent by a collector. |
| `AGENT_MOVE_PUSH_INTERVAL_MS` | Push interval, default `1000` ms. |
| `AGENT_MOVE_INGEST_TOKEN` | Optional Bearer token required by the hub ingest endpoint. |
| `AGENT_MOVE_REMOTE_TTL_MS` | Remove remote snapshots after no refresh; default `15000` ms. |
| `AGENT_MOVE_REMOTE_SOURCES` | Legacy pull mode: comma-separated `id=http://node:3333` list. |
| `AGENT_MOVE_REMOTE_POLL_MS` | Legacy pull interval, default `1000` ms. |
