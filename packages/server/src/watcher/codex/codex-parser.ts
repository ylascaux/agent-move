import type { ParsedActivity } from '../types.js';
import { normalizeToolName, normalizeToolInput } from '@agent-move/shared';
import type { CodexSessionMeta } from './codex-paths.js';

// ── Codex JSONL envelope ────────────────────────────────────────────────────

export interface CodexEnvelope {
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
}

// ── Payload types ───────────────────────────────────────────────────────────

interface FunctionCallPayload {
  type: 'function_call';
  name: string;
  arguments: string; // JSON string
  call_id: string;
}


interface TokenCountInfo {
  total_token_usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
    reasoning_output_tokens?: number;
    total_tokens?: number;
  };
  last_token_usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
    reasoning_output_tokens?: number;
  };
  model_context_window?: number;
}

// ── Parser (stateless) ─────────────────────────────────────────────────────

export class CodexParser {
  /**
   * Parse a single JSONL line into the envelope structure.
   */
  parseRaw(line: string): CodexEnvelope | null {
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj.type === 'string') {
        return obj as CodexEnvelope;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Try to extract session_meta payload. Returns null if not a session_meta envelope.
   */
  tryGetSessionMeta(envelope: CodexEnvelope): CodexSessionMeta | null {
    if (envelope.type !== 'session_meta') return null;
    return envelope.payload as unknown as CodexSessionMeta;
  }

  /**
   * Try to extract model from a turn_context envelope. Returns null otherwise.
   */
  tryGetModel(envelope: CodexEnvelope): string | null {
    if (envelope.type !== 'turn_context') return null;
    const model = envelope.payload?.model as string | undefined;
    return model ?? null;
  }

  /**
   * Parse a Codex JSONL envelope into a ParsedActivity.
   * Model is passed in from the watcher (tracked per-file).
   * Returns null for non-actionable entries.
   */
  parseEntry(envelope: CodexEnvelope, model: string | null): ParsedActivity | null {
    if (envelope.type === 'response_item') {
      return this.parseResponseItem(envelope.payload, model);
    }
    if (envelope.type === 'event_msg') {
      return this.parseEventMsg(envelope.payload, model);
    }
    return null;
  }

  private parseResponseItem(payload: Record<string, unknown>, model: string | null): ParsedActivity | null {
    const itemType = payload.type as string;

    // Function call → tool_use
    if (itemType === 'function_call') {
      const fc = payload as unknown as FunctionCallPayload;
      let toolInput: Record<string, unknown> = {};
      try {
        toolInput = JSON.parse(fc.arguments);
      } catch { /* empty args */ }

      return {
        type: 'tool_use',
        toolName: normalizeToolName(fc.name),
        toolInput: normalizeToolInput(toolInput),
        model: model ?? undefined,
      };
    }

    // Codex Desktop custom tool call. Newer desktop builds wrap the actual
    // tool name in payload.name (for example "exec") instead of encoding it
    // in payload.type. Preserve the raw input as useful activity context.
    if (itemType === 'custom_tool_call') {
      const rawName = typeof payload.name === 'string' ? payload.name : 'custom_tool';
      const rawInput = payload.input;
      let toolInput: Record<string, unknown> = {};

      if (typeof rawInput === 'string') {
        try {
          const parsed = JSON.parse(rawInput);
          toolInput = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : { input: rawInput };
        } catch {
          toolInput = { command: rawInput };
        }
      } else if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
        toolInput = rawInput as Record<string, unknown>;
      }

      return {
        type: 'tool_use',
        toolName: normalizeToolName(rawName),
        toolInput: normalizeToolInput(toolInput),
        model: model ?? undefined,
      };
    }

    // Skip response_item/message — assistant text is handled by event_msg.
    // Older Codex builds emit agent_message; newer Desktop builds emit
    // event_msg/item_completed with an AgentMessage item.

    // Native tool calls (web_search_call, file_search_call, code_interpreter_call, etc.)
    if (itemType.endsWith('_call') && itemType !== 'function_call') {
      // Extract the tool name from the type (e.g., web_search_call → web_search)
      const nativeName = itemType.replace(/_call$/, '');
      const toolInput: Record<string, unknown> = {};
      // Extract query/action details if present
      const action = payload.action as Record<string, unknown> | undefined;
      if (action?.query) toolInput.query = action.query;
      return {
        type: 'tool_use',
        toolName: normalizeToolName(nativeName),
        toolInput,
        model: model ?? undefined,
      };
    }

    // response_item/reasoning is encrypted/no-text in current Codex Desktop.
    // Its paired event_msg/item_completed event is handled below.

    return null;
  }

  private parseEventMsg(payload: Record<string, unknown>, model: string | null): ParsedActivity | null {
    const eventType = payload.type as string;

    // Codex Desktop emits task_started before any legacy agent_reasoning or
    // function_call event. Treat it as activity so a newly-started task is
    // visible immediately instead of waiting for a later parseable event.
    if (eventType === 'task_started') {
      return {
        type: 'tool_use',
        toolName: 'thinking',
        toolInput: { state: 'task_started' },
        model: model ?? undefined,
      };
    }

    // Newer Codex Desktop builds wrap completed reasoning/messages in
    // event_msg/item_completed.
    if (eventType === 'item_completed') {
      const item = payload.item as Record<string, unknown> | undefined;
      const itemType = item?.type as string | undefined;

      if (itemType === 'Reasoning') {
        const summary = item?.summary_text;
        const text = Array.isArray(summary)
          ? summary.filter((v): v is string => typeof v === 'string').join(' ').trim()
          : '';

        return {
          type: 'tool_use',
          toolName: 'thinking',
          toolInput: text ? { thought: text.slice(0, 120) } : { state: 'reasoning' },
          model: model ?? undefined,
        };
      }

      if (itemType === 'AgentMessage') {
        const content = item?.content;
        if (Array.isArray(content)) {
          const text = content
            .map((part) => {
              if (!part || typeof part !== 'object') return '';
              const value = (part as Record<string, unknown>).text;
              return typeof value === 'string' ? value : '';
            })
            .filter(Boolean)
            .join('\n')
            .trim();

          if (text) {
            return {
              type: 'text',
              text: text.length < 200 ? text : text.slice(0, 197) + '...',
              model: model ?? undefined,
            };
          }
        }
      }

      return null;
    }

    // Token count
    if (eventType === 'token_count') {
      const info = payload.info as TokenCountInfo | undefined;
      if (!info?.last_token_usage) return null;

      const usage = info.last_token_usage;
      return {
        type: 'token_usage',
        inputTokens: usage.input_tokens,
        outputTokens: (usage.output_tokens ?? 0) + (usage.reasoning_output_tokens ?? 0),
        cacheReadTokens: usage.cached_input_tokens,
        model: model ?? undefined,
      };
    }

    // Agent message (short text) → speech bubble
    if (eventType === 'agent_message') {
      const text = (payload.message as string)?.trim();
      if (text && text.length > 0 && text.length < 200) {
        return { type: 'text', text, model: model ?? undefined };
      }
    }

    // Agent reasoning → thinking zone
    if (eventType === 'agent_reasoning') {
      const text = (payload.text as string)?.trim();
      if (!text) return null;
      return {
        type: 'tool_use',
        toolName: 'thinking',
        toolInput: { thought: text.slice(0, 120) },
        model: model ?? undefined,
      };
    }

    return null;
  }
}
