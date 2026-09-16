import type { ParsedActivity } from '../types.js';
import { normalizeToolName, normalizeToolInput } from '@agent-move/shared';

// ── OpenCode message data (serialised in message.data column) ─────────────────

export interface OpenCodeMessageData {
  id: string;
  sessionID: string;
  role: 'assistant' | 'user';
  /** OpenCode fills this when an assistant message/step has finished. */
  finish?: string;
  /** Native provider/OpenCode cost when available. AgentMove currently derives UI cost from tokens. */
  cost?: number;
  time?: {
    created?: number;
    completed?: number;
  };
  tokens?: {
    total?: number;
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
  modelID?: string;
  /** Agent preset name (e.g. "build", "research") */
  agent?: string;
}

// ── OpenCode part data (serialised in part.data column) ──────────────────────

interface ToolState {
  status: 'pending' | 'running' | 'completed' | 'error';
  input?: Record<string, unknown>;
  title?: string;
}

interface ToolPart {
  type: 'tool';
  callID: string;
  tool: string;
  state: ToolState;
}

interface TextPart {
  type: 'text';
  text: string;
  synthetic?: boolean;
}

interface ReasoningPart {
  type: 'reasoning';
  text: string;
}

type Part = ToolPart | TextPart | ReasoningPart | { type: string };

export class OpenCodeParser {
  /**
   * Convert an OpenCode part JSON object into a ParsedActivity.
   * All tool names and input field names are normalized to canonical form
   * so downstream code (activity-processor, TOOL_ZONE_MAP, etc.) needs no
   * agent-specific branches.
   *
   * Returns null for parts that carry no actionable activity.
   */
  parsePart(partData: Part, messageData?: OpenCodeMessageData): ParsedActivity | null {
    if (partData.type === 'tool') {
      const tool = partData as ToolPart;
      // Emit on any non-pending status — with 500ms polling we may only see
      // the final 'completed' state if the tool finished before the next poll.
      if (tool.state.status === 'pending') return null;

      const rawInput = tool.state.input ?? {};
      return {
        type: 'tool_use',
        toolName: normalizeToolName(tool.tool),
        toolInput: normalizeToolInput(rawInput),
        agentName: messageData?.agent,
        model: messageData?.modelID,
      };
    }

    if (partData.type === 'text') {
      const text = partData as TextPart;
      if (text.synthetic) return null;
      const trimmed = text.text?.trim() ?? '';
      if (trimmed.length === 0 || trimmed.length >= 200) return null;

      return {
        type: 'text',
        text: trimmed,
        agentName: messageData?.agent,
        model: messageData?.modelID,
      };
    }

    // Reasoning = agent is thinking between tool calls → move to thinking zone.
    // Emit as tool_use with toolName 'thinking' which maps to the thinking zone
    // via the default fallback in getZoneForTool().
    if (partData.type === 'reasoning') {
      const reasoning = partData as ReasoningPart;
      const trimmed = reasoning.text?.trim() ?? '';
      return {
        type: 'tool_use',
        toolName: 'thinking',
        toolInput: trimmed.length > 0 ? { thought: trimmed.slice(0, 120) } : undefined,
        agentName: messageData?.agent,
        model: messageData?.modelID,
      };
    }

    return null;
  }

  /**
   * Emit final token usage from an assistant message row.
   *
   * OpenCode inserts the assistant row before generation has finished and updates
   * that same row as usage becomes available. Counting the first non-final version
   * makes live input/cache/cost metrics freeze at zero or a partial value. Current
   * OpenCode messages expose `finish` and/or `time.completed`; legacy rows without
   * either completion shape are still treated as final for backwards compatibility.
   */
  parseTokenUsage(messageData: OpenCodeMessageData): ParsedActivity | null {
    if (messageData.role !== 'assistant') return null;

    const hasCompletionShape = messageData.time !== undefined ||
      Object.prototype.hasOwnProperty.call(messageData, 'finish');
    const isComplete = Boolean(messageData.finish || messageData.time?.completed);
    if (hasCompletionShape && !isComplete) return null;

    const t = messageData.tokens;
    if (!t) return null;

    const input = t.input ?? 0;
    const output = t.output ?? 0;
    const reasoning = t.reasoning ?? 0;
    const cacheRead = t.cache?.read ?? 0;
    const cacheWrite = t.cache?.write ?? 0;

    if (input === 0 && output === 0 && reasoning === 0 && cacheRead === 0 && cacheWrite === 0) {
      return null;
    }

    return {
      type: 'token_usage',
      inputTokens: input,
      // OpenCode reports reasoning separately; it is billed at the output rate.
      outputTokens: output + reasoning,
      cacheReadTokens: cacheRead,
      cacheCreationTokens: cacheWrite,
      model: messageData.modelID,
      agentName: messageData.agent,
    };
  }
}
