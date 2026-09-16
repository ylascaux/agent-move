import { homedir } from 'os';
import { join } from 'path';

export interface OpenCodeSourceConfig {
  id: string;
  dbPath: string;
}

export interface RemoteSourceConfig {
  id: string;
  url: string;
}

function parseNamedValues(raw: string | undefined): Array<{ id: string; value: string }> {
  if (!raw?.trim()) return [];

  return raw
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .flatMap(entry => {
      const separator = entry.indexOf('=');
      if (separator <= 0 || separator === entry.length - 1) {
        console.warn(`[config] Ignoring invalid source entry "${entry}"; expected id=value`);
        return [];
      }
      const id = entry.slice(0, separator).trim();
      const value = entry.slice(separator + 1).trim();
      if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
        console.warn(`[config] Ignoring invalid source id "${id}"`);
        return [];
      }
      return [{ id, value }];
    });
}

const openCodeSources: OpenCodeSourceConfig[] = parseNamedValues(
  process.env.AGENT_MOVE_OPENCODE_SOURCES,
).map(({ id, value }) => ({ id, dbPath: value }));

const remoteSources: RemoteSourceConfig[] = parseNamedValues(
  process.env.AGENT_MOVE_REMOTE_SOURCES,
).map(({ id, value }) => ({ id, url: value.replace(/\/$/, '') }));

export const config = {
  port: parseInt(process.env.AGENT_MOVE_PORT || '3333', 10),
  host: process.env.AGENT_MOVE_HOST || '127.0.0.1',
  claudeHome: process.env.AGENT_MOVE_CLAUDE_HOME || join(homedir(), '.claude'),
  codexSessionsDir: process.env.AGENT_MOVE_CODEX_SESSIONS || '',
  idleTimeoutMs: 45_000,
  /** How long after going idle before an agent is automatically shutdown/removed */
  shutdownTimeoutMs: 30 * 60 * 1000, // 30 minutes
  /** How recently a session file must be modified to be considered "active" on startup */
  activeThresholdMs: 10 * 60 * 1000, // 10 minutes
  /** Enable Claude JSONL watching. */
  enableClaude: process.env.AGENT_MOVE_CLAUDE !== 'false',
  /** Enable OpenCode session watching (auto-detected if storage dir exists) */
  enableOpenCode: process.env.AGENT_MOVE_OPENCODE !== 'false',
  /** Explicit id=/path/opencode.db sources, useful for Docker volumes. */
  openCodeSources,
  /** Enable pi coding agent session watching (auto-detected if sessions dir exists) */
  enablePi: process.env.AGENT_MOVE_PI !== 'false',
  /** Enable Codex CLI session watching (auto-detected if sessions dir exists) */
  enableCodex: process.env.AGENT_MOVE_CODEX !== 'false',
  /** Remote AgentMove nodes as id=http://host:3333. Hub polls /api/state. */
  remoteSources,
  remotePollMs: Math.max(250, parseInt(process.env.AGENT_MOVE_REMOTE_POLL_MS || '1000', 10)),
} as const;
