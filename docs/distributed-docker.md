# Distributed AgentMove with Docker

AgentMove can run as the same Docker image on every machine.

- A **node** reads local Claude Code, Codex CLI and/or OpenCode session storage through read-only mounts.
- A **hub** is the same image with `AGENT_MOVE_REMOTE_SOURCES` configured. It merges the remote node snapshots with any sessions mounted locally.
- Nodes never need the Docker socket and never connect to the OpenCode/Claude/Codex process itself.

## Start a node

Copy the example file and enable only the collectors you need:

```bash
cp docker-compose.example.yml docker-compose.yml
docker compose up -d --build
```

Open `http://localhost:3333` to verify the node.

## Select collectors with mounts

### OpenCode on the host

```yaml
environment:
  AGENT_MOVE_OPENCODE: "true"
  AGENT_MOVE_OPENCODE_SOURCES: "host=/sources/opencode/opencode.db"
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
  agent-move:
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

Each explicit OpenCode source namespaces its session IDs, for example `oc:staging-1:<session-id>`, so sessions from several containers cannot collide.

## Aggregate your machines

Run a node on each machine, for example:

- personal machine: `http://personal-agent-move:3333`
- work laptop: `http://work-agent-move:3333`
- server: `http://server-agent-move:3333`

On the instance you want to use as the main UI, configure:

```yaml
environment:
  AGENT_MOVE_REMOTE_SOURCES: >-
    work=http://work-agent-move:3333,
    server=http://server-agent-move:3333
  AGENT_MOVE_REMOTE_POLL_MS: "1000"
```

The hub polls each node's `/api/state`, prefixes remote IDs with `remote:<node>:` and publishes the merged state through the normal AgentMove WebSocket/UI.

A node should not point back at its hub; keep aggregation one-way to avoid recursive aggregation.

## Network security

AgentMove currently has no authentication layer. Do not expose port `3333` directly to the public Internet. Put nodes on a private network/VPN, bind them behind an authenticated private proxy, or use an SSH tunnel.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `AGENT_MOVE_HOST` | Listen address. Docker normally uses `0.0.0.0`. |
| `AGENT_MOVE_PORT` | HTTP/UI port, default `3333`. |
| `AGENT_MOVE_CLAUDE` | Enable Claude watcher. |
| `AGENT_MOVE_CLAUDE_HOME` | Mounted Claude home, e.g. `/sources/claude`. |
| `AGENT_MOVE_OPENCODE` | Enable OpenCode watcher. |
| `AGENT_MOVE_OPENCODE_SOURCES` | Comma-separated `id=/path/opencode.db` list. |
| `AGENT_MOVE_CODEX` | Enable Codex watcher. |
| `AGENT_MOVE_CODEX_SESSIONS` | Mounted Codex sessions directory. |
| `AGENT_MOVE_PI` | Enable pi watcher. |
| `AGENT_MOVE_REMOTE_SOURCES` | Comma-separated `id=http://node:3333` list for hub mode. |
| `AGENT_MOVE_REMOTE_POLL_MS` | Remote snapshot interval, default `1000` ms. |
