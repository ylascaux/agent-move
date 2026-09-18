import chokidar from 'chokidar';
import Database from 'better-sqlite3';
import type { AgentSource } from '@agent-move/shared';
import type { AgentStateManager } from '../../state/agent-state-manager.js';
import { createFallbackSession } from '../types.js';
import type { SessionInfo } from '../types.js';
import { config } from '../../config.js';
import {
  getOpenCodeDbPath,
  parseOpenCodeSession,
  type OpenCodeSessionRow,
} from './opencode-paths.js';
import { OpenCodeParser, type OpenCodeMessageData } from './opencode-parser.js';
import type { AgentWatcher } from '../agent-watcher.js';

interface MessageRow {
  id: string;
  session_id: string;
  time_updated: number;
  data: string;
  type?: string;
  seq?: number;
}

interface PartRow {
  id: string;
  message_id: string;
  session_id: string;
  time_created: number;
  time_updated: number;
  data: string;
}

export interface OpenCodeWatcherOptions {
  /** Explicit database path. Omit to keep the legacy auto-detection behavior. */
  dbPath?: string;
  /** Stable source id. When set, session IDs are namespaced as oc:<sourceId>:<sessionId>. */
  sourceId?: string;
  /** Human readable source name exposed to the client. */
  sourceName?: string;
  /** Runtime hint, usually "host" or "docker". */
  runtime?: string;
}

/**
 * Watches one OpenCode SQLite database for new activity and forwards it to AgentStateManager.
 * Multiple instances may run at the same time, which is how Docker volumes / multiple workers
 * are aggregated without ever reading SQLite over a network filesystem.
 *
 * Strategy:
 *   1. Open the DB in readonly mode (WAL allows concurrent readers).
 *   2. On startup, replay messages/parts from recently-active sessions.
 *   3. Watch the WAL file (opencode.db-wal) with chokidar — it changes on every write.
 *   4. On each notification, query rows with time_updated > lastSeenTs.
 */
export class OpenCodeWatcher implements AgentWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private db: Database.Database | null = null;
  private parser = new OpenCodeParser();
  private readonly source?: AgentSource;
  /** True when the freshest OpenCode data is stored in the V2 projection tables. */
  private useV2 = false;

  /** Timestamp watermark for incremental polling (ms) */
  private lastMessageTs = 0;
  /** Tracks time_created (not time_updated) so each part is processed exactly once */
  private lastPartCreatedTs = 0;

  /** sessionId → SessionInfo cache */
  private sessions = new Map<string, SessionInfo>();
  /** messageId → parsed message data cache */
  private messages = new Map<string, OpenCodeMessageData>();
  /** callID → true — deduplicates tool_use per tool invocation */
  private seenCallIds = new Set<string>();
  /** row id → true — deduplicates text/token events */
  private seenIds = new Set<string>();
  /**
   * Per-session idle timers: after step-finish, if no new step-start
   * arrives within this window, call hookStop to idle the agent.
   */
  private stepFinishTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly STEP_FINISH_IDLE_MS = 4000;
  /**
   * Per-session shutdown timers: after step-finish, if no new activity
   * arrives within this longer window, call hookSessionEnd to fully shut
   * down the agent and finalize the session. This handles /exit and closed terminals.
   */
  private sessionEndTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly SESSION_END_MS = 180_000;

  // Prepared statements (initialised after DB opens)
  private stmtAllSessions!: Database.Statement;
  private stmtRecentSessions!: Database.Statement;
  private stmtMessagesBySession!: Database.Statement;
  private stmtPartsBySession!: Database.Statement;
  private stmtNewMessages!: Database.Statement;
  private stmtNewParts!: Database.Statement;

  constructor(
    private stateManager: AgentStateManager,
    private options: OpenCodeWatcherOptions = {},
  ) {
    if (options.sourceId) {
      this.source = {
        id: options.sourceId,
        name: options.sourceName || options.sourceId,
        kind: 'local',
        runtime: options.runtime,
      };
    } else {
      // Preserve legacy session IDs while still exposing useful source metadata.
      this.source = {
        id: 'local',
        name: options.sourceName || 'Local',
        kind: 'local',
        runtime: options.runtime || 'host',
      };
    }
  }

  async start(): Promise<void> {
    const activeThresholdMs = config.activeThresholdMs;
    const dbPath = this.options.dbPath ?? getOpenCodeDbPath();
    if (!dbPath) {
      console.log(`${this.logPrefix()} No database found — OpenCode not installed or not yet used`);
      return;
    }

    console.log(`${this.logPrefix()} Database found at ${dbPath}`);

    try {
      this.db = new Database(dbPath, { readonly: true, fileMustExist: true });
      this.prepareStatements();
    } catch (err) {
      console.error(`${this.logPrefix()} Failed to open database:`, err);
      return;
    }

    // Load all sessions into cache upfront
    this.loadAllSessions();

    // Replay recently-active sessions, tracking max timestamps seen
    this.replayRecentSessions(activeThresholdMs);

    // After replay: if no messages/parts were seen, baseline to now so the
    // first poll() doesn't re-scan the entire history.
    if (this.lastMessageTs === 0) this.lastMessageTs = Date.now() - 5000;
    if (this.lastPartCreatedTs === 0) this.lastPartCreatedTs = Date.now() - 5000;

    // Poll the WAL file — fs.watch is unreliable for SQLite WAL on Windows
    // (the kernel doesn't emit change events on WAL appends). Polling at 500ms
    // gives near-real-time detection without hammering the disk.
    const walPath = dbPath + '-wal';
    this.watcher = chokidar.watch(walPath, {
      persistent: true,
      ignoreInitial: true,
      usePolling: true,
      interval: 500,
      disableGlobbing: true,
    });

    this.watcher.on('change', () => this.poll());
    this.watcher.on('add', () => this.poll());

    console.log(`${this.logPrefix()} Watching for new activity`);
  }

  stop() {
    this.watcher?.close();
    this.db?.close();
    this.sessions.clear();
    this.messages.clear();
    this.seenCallIds.clear();
    this.seenIds.clear();
    for (const t of this.stepFinishTimers.values()) clearTimeout(t);
    this.stepFinishTimers.clear();
    for (const t of this.sessionEndTimers.values()) clearTimeout(t);
    this.sessionEndTimers.clear();
  }

  // ── Prepared statements ────────────────────────────────────────────────────

  private prepareStatements() {
    const db = this.db!;

    // OpenCode 2 beta keeps the legacy V1 tables for compatibility, while new
    // activity is projected into session_v2/session_message. Pick whichever
    // session table is freshest so old OpenCode installations keep working.
    const tables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>)
        .map((row) => row.name),
    );
    const hasV2 = tables.has('session_v2') && tables.has('session_message');
    const latestV1 = tables.has('session')
      ? ((db.prepare('SELECT MAX(time_updated) AS ts FROM session').get() as { ts?: number | null })?.ts ?? 0)
      : 0;
    const latestV2 = hasV2
      ? ((db.prepare('SELECT MAX(time_updated) AS ts FROM session_v2').get() as { ts?: number | null })?.ts ?? 0)
      : 0;

    this.useV2 = hasV2 && latestV2 >= latestV1 && latestV2 > 0;
    const sessionTable = this.useV2 ? 'session_v2' : 'session';

    console.log(
      `${this.logPrefix()} Using OpenCode ${this.useV2 ? 'V2' : 'V1'} schema ` +
      `(latest v1=${latestV1 || '-'}, v2=${latestV2 || '-'})`,
    );

    this.stmtAllSessions = db.prepare(
      `SELECT id, directory, parent_id, title, project_id FROM ${sessionTable}`,
    );
    this.stmtRecentSessions = db.prepare(
      `SELECT id, directory, parent_id, title, project_id FROM ${sessionTable} WHERE time_updated > ?`,
    );

    if (this.useV2) {
      this.stmtMessagesBySession = db.prepare(
        'SELECT id, session_id, type, seq, time_updated, data FROM session_message WHERE session_id = ? ORDER BY seq',
      );
      this.stmtNewMessages = db.prepare(
        'SELECT id, session_id, type, seq, time_updated, data FROM session_message WHERE time_updated > ? ORDER BY time_updated, seq',
      );

      // V2 stores assistant text/reasoning/tools inline in session_message.data.
      // Keep no-op statements so the legacy replay/poll flow remains simple.
      this.stmtPartsBySession = db.prepare(
        "SELECT '' AS id, '' AS message_id, '' AS session_id, 0 AS time_created, 0 AS time_updated, '' AS data WHERE 0",
      );
      this.stmtNewParts = this.stmtPartsBySession;
    } else {
      this.stmtMessagesBySession = db.prepare(
        'SELECT id, session_id, time_updated, data FROM message WHERE session_id = ? ORDER BY time_created',
      );
      this.stmtPartsBySession = db.prepare(
        'SELECT id, message_id, session_id, time_created, time_updated, data FROM part WHERE session_id = ? ORDER BY time_created',
      );
      this.stmtNewMessages = db.prepare(
        'SELECT id, session_id, time_updated, data FROM message WHERE time_updated > ? ORDER BY time_updated',
      );
      this.stmtNewParts = db.prepare(
        'SELECT id, message_id, session_id, time_created, time_updated, data FROM part WHERE time_created > ? ORDER BY time_created',
      );
    }
  }

  // ── Session cache ──────────────────────────────────────────────────────────

  private loadAllSessions() {
    const rows = this.stmtAllSessions.all() as OpenCodeSessionRow[];
    for (const row of rows) {
      this.sessions.set(row.id, this.parseSession(row));
    }
  }

  // ── Startup replay ─────────────────────────────────────────────────────────

  private replayRecentSessions(activeThresholdMs: number) {
    const cutoff = Date.now() - activeThresholdMs;
    const recent = this.stmtRecentSessions.all(cutoff) as OpenCodeSessionRow[];
    if (recent.length === 0) return;

    console.log(`${this.logPrefix()} Replaying ${recent.length} recent session(s)`);
    for (const session of recent) {
      this.sessions.set(session.id, this.parseSession(session));
      this.replaySession(session.id);
    }
  }

  private replaySession(sessionId: string) {
    const messages = this.stmtMessagesBySession.all(sessionId) as MessageRow[];
    for (const msg of messages) {
      this.processMessageRow(msg);
      if (msg.time_updated > this.lastMessageTs) this.lastMessageTs = msg.time_updated;
    }

    const parts = this.stmtPartsBySession.all(sessionId) as PartRow[];
    for (const part of parts) {
      this.processPartRow(part);
      if (part.time_created > this.lastPartCreatedTs) this.lastPartCreatedTs = part.time_created;
    }
  }

  // ── Live polling ───────────────────────────────────────────────────────────

  private poll() {
    if (!this.db) return;
    try {
      // Refresh session cache for any sessions we don't know about yet
      const newSessions = this.stmtRecentSessions.all(
        Date.now() - 60_000, // last 60s — wide net to catch fresh sessions
      ) as OpenCodeSessionRow[];
      for (const row of newSessions) {
        if (!this.sessions.has(row.id)) {
          this.sessions.set(row.id, this.parseSession(row));
          console.log(`${this.logPrefix()} New session: ${row.id.slice(0, 20)} (${row.directory})`);
        }
      }

      // New/updated messages since last poll
      const newMessages = this.stmtNewMessages.all(this.lastMessageTs) as MessageRow[];
      for (const msg of newMessages) {
        this.processMessageRow(msg);
        if (msg.time_updated > this.lastMessageTs) this.lastMessageTs = msg.time_updated;
      }

      // New parts since last poll (by time_created — each part processed exactly once)
      const newParts = this.stmtNewParts.all(this.lastPartCreatedTs) as PartRow[];
      for (const part of newParts) {
        this.processPartRow(part);
        if (part.time_created > this.lastPartCreatedTs) this.lastPartCreatedTs = part.time_created;
      }
    } catch (err) {
      console.error(`${this.logPrefix()} Poll error:`, err);
    }
  }

  // ── Row processors ─────────────────────────────────────────────────────────

  private processMessageRow(row: MessageRow) {
    if (this.useV2) {
      this.processV2MessageRow(row);
      return;
    }

    let data: OpenCodeMessageData;
    try {
      data = JSON.parse(row.data);
    } catch {
      return;
    }

    // Cache every revision so parts can find the latest parent context.
    this.messages.set(row.id, data);

    // OpenCode creates an assistant row before usage is finalized, then updates
    // that same row. Do not mark it as consumed until parseTokenUsage sees the
    // finalized usage; otherwise live token/cache/cost metrics freeze at zero.
    const seenKey = 'msg:' + row.id;
    if (this.seenIds.has(seenKey)) return;

    const activity = this.parser.parseTokenUsage(data);
    if (!activity) return;
    this.seenIds.add(seenKey);

    // Cancel any pending timers — real activity from this session
    const prefixedId = this.prefixed(row.session_id);
    this.cancelStepFinishTimer(prefixedId);
    this.cancelSessionEndTimer(prefixedId);

    const sessionInfo = this.getSessionInfo(row.session_id);
    this.stateManager.processMessage(prefixedId, activity, sessionInfo);
  }

  private processV2MessageRow(row: MessageRow) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(row.data) as Record<string, unknown>;
    } catch {
      return;
    }

    const prefixedId = this.prefixed(row.session_id);
    const sessionInfo = this.getSessionInfo(row.session_id);

    if (row.type === 'idle') {
      this.stateManager.hookStop(prefixedId);
      return;
    }

    if (row.type === 'shell') {
      const command = typeof data.command === 'string' ? data.command : '';
      const seenKey = `v2:shell:${row.id}:${command}`;
      if (this.seenIds.has(seenKey)) return;
      this.seenIds.add(seenKey);

      this.stateManager.processMessage(prefixedId, {
        type: 'tool_use',
        toolName: 'Bash',
        toolInput: command ? { command } : {},
      }, sessionInfo);
      return;
    }

    if (row.type !== 'assistant') return;

    const model = data.model as Record<string, unknown> | undefined;
    const messageData: OpenCodeMessageData = {
      id: row.id,
      sessionID: row.session_id,
      role: 'assistant',
      finish: typeof data.finish === 'string' ? data.finish : undefined,
      cost: typeof data.cost === 'number' ? data.cost : undefined,
      time: data.time as OpenCodeMessageData['time'],
      tokens: data.tokens as OpenCodeMessageData['tokens'],
      modelID: typeof model?.id === 'string' ? model.id : undefined,
      agent: typeof data.agent === 'string' ? data.agent : undefined,
    };
    this.messages.set(row.id, messageData);

    // Usage becomes authoritative once the assistant message is completed.
    const tokenKey = `v2:tokens:${row.id}`;
    if (!this.seenIds.has(tokenKey)) {
      const usage = this.parser.parseTokenUsage(messageData);
      if (usage) {
        this.seenIds.add(tokenKey);
        this.stateManager.processMessage(prefixedId, usage, sessionInfo);
      }
    }

    const content = Array.isArray(data.content) ? data.content : [];
    for (const rawPart of content) {
      if (!rawPart || typeof rawPart !== 'object') continue;
      const part = rawPart as Record<string, unknown>;
      const partType = part.type;
      const partId = typeof part.id === 'string' ? part.id : 'part';

      let seenKey: string | null = null;
      let activity = null;

      if (partType === 'tool') {
        const state = part.state as Record<string, unknown> | undefined;
        const status = typeof state?.status === 'string' ? state.status : 'unknown';
        seenKey = `v2:tool:${row.id}:${partId}:${status}`;
        if (this.seenIds.has(seenKey)) continue;

        activity = this.parser.parsePart({
          type: 'tool',
          callID: partId,
          tool: typeof part.name === 'string' ? part.name : 'tool',
          state: (state ?? { status: 'pending' }) as any,
        } as any, messageData);
      } else if (partType === 'reasoning') {
        const text = typeof part.text === 'string' ? part.text : '';
        seenKey = `v2:reasoning:${row.id}:${partId}:${text}`;
        if (this.seenIds.has(seenKey)) continue;

        activity = this.parser.parsePart({
          type: 'reasoning',
          text,
        } as any, messageData);
      } else if (partType === 'text') {
        const text = typeof part.text === 'string' ? part.text.trim() : '';
        if (!text) continue;

        // Streaming V2 rows update the same text item repeatedly. Only expose
        // assistant text once the message has completed, while tool/reasoning
        // activity stays live.
        const completed = Boolean((data.time as Record<string, unknown> | undefined)?.completed);
        if (!completed) continue;

        const visibleText = text.length < 200 ? text : text.slice(0, 197) + '...';
        seenKey = `v2:text:${row.id}:${partId}:${visibleText}`;
        if (this.seenIds.has(seenKey)) continue;

        activity = this.parser.parsePart({
          type: 'text',
          text: visibleText,
        } as any, messageData);
      }

      if (!activity || !seenKey) continue;
      this.seenIds.add(seenKey);
      this.cancelStepFinishTimer(prefixedId);
      this.cancelSessionEndTimer(prefixedId);
      this.stateManager.processMessage(prefixedId, activity, sessionInfo);
    }
  }

  private processPartRow(row: PartRow) {
    let data: {
      type: string;
      callID?: string;
      state?: { status: string };
      text?: string;
      synthetic?: boolean;
    };
    try {
      data = JSON.parse(row.data);
    } catch {
      return;
    }

    const messageData = this.messages.get(row.message_id);

    // step-start / step-finish: heartbeat only — keep agent alive, no zone change
    if (data.type === 'step-start' || data.type === 'step-finish') {
      if (this.seenIds.has(row.id)) return;
      this.seenIds.add(row.id);
      const prefixedId = this.prefixed(row.session_id);
      if (data.type === 'step-start') {
        // Cancel any pending timers — agent is still active
        this.cancelStepFinishTimer(prefixedId);
        this.cancelSessionEndTimer(prefixedId);
        this.stateManager.heartbeat(prefixedId);
      } else {
        // step-finish: start idle timer (short) and session-end timer (long).
        // Short timer idles the agent between turns; long timer fully shuts
        // it down if the user has exited OpenCode.
        this.cancelStepFinishTimer(prefixedId);
        this.cancelSessionEndTimer(prefixedId);
        const idleTimer = setTimeout(() => {
          this.stepFinishTimers.delete(prefixedId);
          this.stateManager.hookStop(prefixedId);
        }, OpenCodeWatcher.STEP_FINISH_IDLE_MS);
        this.stepFinishTimers.set(prefixedId, idleTimer);
        const endTimer = setTimeout(() => {
          this.sessionEndTimers.delete(prefixedId);
          this.stateManager.hookSessionEnd(prefixedId);
        }, OpenCodeWatcher.SESSION_END_MS);
        this.sessionEndTimers.set(prefixedId, endTimer);
      }
      return;
    }

    // Tool parts: deduplicate by callID (one emission per tool invocation)
    if (data.type === 'tool' && data.callID) {
      if (this.seenCallIds.has(data.callID)) return;
      this.seenCallIds.add(data.callID);
    } else {
      // Text / reasoning / other parts: deduplicate by row id
      if (this.seenIds.has(row.id)) return;
      this.seenIds.add(row.id);
    }

    const activity = this.parser.parsePart(data as any, messageData);
    if (!activity) return;

    // Cancel any pending timers — real activity is arriving
    const prefixedId = this.prefixed(row.session_id);
    this.cancelStepFinishTimer(prefixedId);
    this.cancelSessionEndTimer(prefixedId);

    const sessionInfo = this.getSessionInfo(row.session_id);
    this.stateManager.processMessage(prefixedId, activity, sessionInfo);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private cancelStepFinishTimer(prefixedId: string): void {
    const timer = this.stepFinishTimers.get(prefixedId);
    if (timer) {
      clearTimeout(timer);
      this.stepFinishTimers.delete(prefixedId);
    }
  }

  private cancelSessionEndTimer(prefixedId: string): void {
    const timer = this.sessionEndTimers.get(prefixedId);
    if (timer) {
      clearTimeout(timer);
      this.sessionEndTimers.delete(prefixedId);
    }
  }

  private getSessionInfo(sessionId: string): SessionInfo {
    const cached = this.sessions.get(sessionId);
    if (cached) return cached;

    // Session not in cache yet — refresh and try again
    this.loadAllSessions();
    return this.sessions.get(sessionId) ?? this.fallbackSession();
  }

  private parseSession(row: OpenCodeSessionRow): SessionInfo {
    return parseOpenCodeSession(row, this.source, this.options.sourceId);
  }

  private prefixed(id: string): string {
    if (id.startsWith('oc:')) return id;
    return this.options.sourceId ? `oc:${this.options.sourceId}:${id}` : `oc:${id}`;
  }

  private fallbackSession(): SessionInfo {
    return createFallbackSession(
      'opencode',
      this.options.sourceName || this.options.sourceId || 'opencode',
      this.source,
    );
  }

  private logPrefix(): string {
    return this.options.sourceId ? `[opencode:${this.options.sourceId}]` : '[opencode]';
  }
}
