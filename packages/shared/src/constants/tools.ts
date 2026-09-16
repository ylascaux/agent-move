import type { ZoneId } from '../types/zone.js';

/** Tool name -> icon mapping for speech bubbles */
export const TOOL_ICONS: Record<string, string> = {
  Read: '\u{1F4D6}',
  Write: '\u{270F}\uFE0F',
  Edit: '\u{1F527}',
  Patch: '\u{1F527}',
  Bash: '\u{1F4BB}',
  Glob: '\u{1F50D}',
  Grep: '\u{1F50E}',
  WebSearch: '\u{1F310}',
  WebFetch: '\u{1F310}',
  Agent: '\u{1F916}',
  TeamCreate: '\u{1F465}',
  SendMessage: '\u{1F4AC}',
  TaskCreate: '\u{1F4CB}',
  TaskUpdate: '\u{2705}',
  TodoRead: '\u{1F4CB}',
  TodoWrite: '\u{2705}',
  AskUserQuestion: '\u{2753}',
  EnterPlanMode: '\u{1F4DD}',
  ExitPlanMode: '\u{1F4DD}',
};

/**
 * Base tool -> workflow room mapping.
 *
 * Historical ZoneId values are intentionally retained so persisted sessions and
 * older clients keep working, while their visible meaning is now:
 * files=Build, terminal=Deploy/Ops, search=Research, web=Security,
 * thinking=Thinking, messaging=Review/Judge, tasks=Plan, idle=Idle,
 * spawn=Orchestrate.
 */
export const TOOL_ZONE_MAP: Record<string, ZoneId> = {
  // Build
  Write: 'files',
  Edit: 'files',
  Patch: 'files',
  NotebookEdit: 'files',
  Bash: 'files',

  // Research / evidence gathering
  Read: 'search',
  Glob: 'search',
  Grep: 'search',
  WebSearch: 'search',
  WebFetch: 'search',

  // Thinking
  AskUserQuestion: 'thinking',

  // Plan
  EnterPlanMode: 'tasks',
  ExitPlanMode: 'tasks',
  TaskCreate: 'tasks',
  TaskUpdate: 'tasks',
  TaskList: 'tasks',
  TaskGet: 'tasks',
  TodoRead: 'tasks',
  TodoWrite: 'tasks',

  // Orchestration / delegation
  Agent: 'spawn',
  TeamCreate: 'spawn',
  TeamDelete: 'spawn',
  SendMessage: 'spawn',
};

export interface ZoneResolutionContext {
  agentName?: string | null;
  taskDescription?: string | null;
  projectName?: string | null;
  isPlanning?: boolean;
}

const SECURITY_RE = /\b(security|securit[eé]|vuln(?:erabilit(?:y|ies|e|és))?|cve|hardening|pentest|compliance|risk|trivy|gitleaks|semgrep|checkov|tfsec|snyk|osv)\b/i;
const REVIEW_RE = /\b(review(?:er)?|judge|critic|validator|validation|quality|qa|acceptance|approve|approval)\b/i;
const ORCHESTRATE_RE = /\b(orchestr(?:ator|ate|ation)?|coordinat(?:or|e|ion)?|supervisor|dispatcher)\b/i;
const PLAN_RE = /\b(plan(?:ner|ning)?|architect(?:ure)?|design|spec(?:ification)?s?)\b/i;
const RESEARCH_RE = /\b(research(?:er)?|investigat(?:e|ion|or)?|analyst|analysis|discovery|evidence|benchmark)\b/i;
const DEPLOY_RE = /\b(deploy(?:ment)?|platform|infra(?:structure)?|sre|operations|ops|release|kubernetes|k8s|terraform|terragrunt|argocd|helm|ansible|pulumi|cloudformation|kubectl)\b/i;
const BUILD_RE = /\b(writer|builder|build|coder|developer|implementation?|implement(?:er|ation)?|engineer|refactor|fix)\b/i;
const SECURITY_COMMAND_RE = /\b(trivy|gitleaks|semgrep|checkov|tfsec|snyk|osv-scanner|npm\s+audit|pnpm\s+audit|yarn\s+audit|cargo\s+audit)\b/i;
const DEPLOY_COMMAND_RE = /\b(terraform|terragrunt|kubectl|helm|argocd|ansible|pulumi|cloudformation|cdk|docker\s+compose\s+(?:up|down|pull|restart)|deploy|release)\b/i;

function stringifyInput(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function roleText(context: ZoneResolutionContext): string {
  // Agent identity and assigned mission are stronger signals than the current
  // low-level tool. A judge reading a file is still judging; a security agent
  // running Bash is still doing security work.
  return [context.agentName, context.taskDescription]
    .filter((value): value is string => Boolean(value))
    .join(' ');
}

/**
 * Resolve the room from both the current tool and the agent's mission.
 *
 * This is intentionally heuristic: OpenCode/Claude/Codex expose different
 * event shapes, but all of them eventually provide a normalized tool plus
 * enough identity/task context for useful workflow classification.
 */
export function getZoneForActivity(
  toolName: string,
  toolInput?: unknown,
  context: ZoneResolutionContext = {},
): ZoneId {
  const mission = roleText(context);
  const inputText = stringifyInput(toolInput);
  const combined = `${mission} ${inputText}`;

  // Strong specialist identities keep their room while using ordinary tools.
  if (REVIEW_RE.test(mission)) return 'messaging';
  if (SECURITY_RE.test(mission)) return 'web';
  if (ORCHESTRATE_RE.test(mission)) return 'spawn';

  // Explicit planning state wins over incidental reads/writes.
  if (context.isPlanning || toolName === 'EnterPlanMode' || toolName === 'ExitPlanMode') return 'tasks';

  // Specialist task descriptions and shell commands.
  if (SECURITY_RE.test(combined) || (toolName === 'Bash' && SECURITY_COMMAND_RE.test(inputText))) return 'web';
  if (DEPLOY_RE.test(combined) || (toolName === 'Bash' && DEPLOY_COMMAND_RE.test(inputText))) return 'terminal';
  if (PLAN_RE.test(mission)) return 'tasks';
  if (RESEARCH_RE.test(mission)) return 'search';
  if (BUILD_RE.test(mission)) return 'files';

  // Multi-agent primitives are orchestration, not generic messaging.
  if (toolName === 'Agent' || toolName === 'TeamCreate' || toolName === 'TeamDelete' || toolName === 'SendMessage') {
    return 'spawn';
  }

  // Browser/MCP calls are research unless a specialist identity above says otherwise.
  if (toolName.startsWith('mcp__')) return 'search';

  return TOOL_ZONE_MAP[toolName] ?? 'thinking';
}

/** Compatibility helper used by fast hook previews and older call sites. */
export function getZoneForTool(toolName: string): ZoneId {
  return getZoneForActivity(toolName);
}

/**
 * Agent-specific tool name → canonical PascalCase name.
 * Each agent parser calls normalizeToolName() before emitting ParsedActivity,
 * so the rest of the pipeline only ever sees canonical names.
 */
const TOOL_NAME_MAP: Record<string, string> = {
  // OpenCode / pi lowercase → canonical PascalCase
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  patch: 'Patch',
  glob: 'Glob',
  bash: 'Bash',
  grep: 'Grep',
  websearch: 'WebSearch',
  webfetch: 'WebFetch',
  todoread: 'TodoRead',
  todowrite: 'TodoWrite',
  // pi-specific tool names
  'edit-diff': 'Patch',
  find: 'Glob',
  ls: 'Bash',
  truncate: 'Write',
  // Codex CLI tool names
  shell_command: 'Bash',
  exec_command: 'Bash',
  read_file: 'Read',
  apply_patch: 'Patch',
  list_dir: 'Bash',
  grep_files: 'Grep',
  web_search: 'WebSearch',
  js_repl: 'Bash',
  js_repl_reset: 'Bash',
  spawn_agent: 'Agent',
  send_input: 'Agent',
  wait: 'Agent',
  close_agent: 'Agent',
  resume_agent: 'Agent',
  spawn_agents_on_csv: 'Agent',
  report_agent_job_result: 'Agent',
  request_user_input: 'AskUserQuestion',
  request_permissions: 'AskUserQuestion',
  update_plan: 'TodoWrite',
  view_image: 'Read',
  image_generation: 'Write',
  write_stdin: 'Bash',
  search_apps: 'WebSearch',
};

/** Normalize an agent-specific tool name to the canonical form. */
export function normalizeToolName(name: string): string {
  return TOOL_NAME_MAP[name] ?? name;
}

/**
 * Normalize agent-specific tool input field names to snake_case.
 * Called by each agent parser so activity-processor always receives snake_case.
 */
export function normalizeToolInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (!('filePath' in input) && !('oldString' in input) && !('newString' in input) && !('replaceAll' in input)) {
    return input;
  }
  const out = { ...input };
  if ('filePath' in out)  { out.file_path  = out.filePath;  delete out.filePath; }
  if ('oldString' in out) { out.old_string = out.oldString; delete out.oldString; }
  if ('newString' in out) { out.new_string = out.newString; delete out.newString; }
  if ('replaceAll' in out) { out.replace_all = out.replaceAll; delete out.replaceAll; }
  return out;
}

/** Canonical tool names that write/modify files */
export const FILE_WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

/** Canonical tool names that read/search files */
export const FILE_READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);
