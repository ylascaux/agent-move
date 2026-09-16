import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
import type { AgentSource } from '@agent-move/shared';
import type { SessionInfo } from '../types.js';

/**
 * Find the OpenCode SQLite database file.
 * OpenCode stores everything in a single DB at:
 *   Linux/Mac: ~/.local/share/opencode/opencode.db
 *   Windows:   same path (OpenCode uses XDG even on Windows)
 */
export function getOpenCodeDbPath(): string | null {
  const home = homedir();
  const candidates: string[] = [
    join(home, '.local', 'share', 'opencode', 'opencode.db'),
    // Windows fallback via LOCALAPPDATA
    ...(process.env.LOCALAPPDATA
      ? [join(process.env.LOCALAPPDATA, 'opencode', 'opencode.db')]
      : []),
    join(home, '.opencode', 'opencode.db'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export interface OpenCodeSessionRow {
  id: string;
  directory: string;
  parent_id: string | null;
  title: string;
  project_id: string;
}

/**
 * Convert an OpenCode session DB row into the shared SessionInfo format.
 * sourceId is also used to namespace parent session IDs when multiple
 * OpenCode databases are watched by the same AgentMove process.
 */
export function parseOpenCodeSession(
  row: OpenCodeSessionRow,
  source?: AgentSource,
  sourceId?: string,
): SessionInfo {
  const segments = row.directory.replace(/\\/g, '/').split('/').filter(Boolean);
  const projectName = segments[segments.length - 1] || 'opencode';
  const parentPrefix = sourceId ? `oc:${sourceId}:` : 'oc:';

  return {
    agentType: 'opencode',
    // Use the actual directory as projectPath so getGitBranch() gets a valid cwd.
    // projectDir uses the project_id hash to group agents belonging to the same project.
    projectPath: row.directory || row.project_id,
    projectName,
    isSubagent: !!row.parent_id,
    source,
    projectDir: sourceId ? `${sourceId}:${row.project_id}` : row.project_id,
    parentSessionId: row.parent_id ? `${parentPrefix}${row.parent_id}` : null,
  };
}
