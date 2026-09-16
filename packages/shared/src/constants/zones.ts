import type { ZoneConfig } from '../types/zone.js';

/**
 * Workflow-oriented room layout.
 *
 * AgentMove keeps the historical internal ZoneId values for backwards
 * compatibility, but the rooms now represent the phases that matter when
 * supervising coding/platform agents rather than literal tool categories.
 *
 * Internal id -> displayed workflow room:
 *   thinking  -> Thinking
 *   tasks     -> Plan
 *   search    -> Research
 *   files     -> Build
 *   messaging -> Review / Judge
 *   web       -> Security
 *   terminal  -> Deploy / Ops
 *   spawn     -> Orchestrate
 *   idle      -> Idle
 *
 * Layout:
 * ┌──────────────┬──────────────┬──────────────┐
 * │ Thinking     │ Plan         │ Research     │
 * ├─────────────────────┬──────────┬───────────┤
 * │ Build               │ Review   │ Security  │
 * ├──────────────┬──────────────┬──────────────┤
 * │ Deploy / Ops │ Orchestrate  │ Idle         │
 * └──────────────┴──────────────┴──────────────┘
 *
 * x/y/width/height are computed by LayoutEngine at runtime.
 */

export const GRID_COLS = 12;
export const ROW_WEIGHTS = [3, 4, 3];

export const ZONES: ZoneConfig[] = [
  // Row 0 — cognition
  {
    id: 'thinking',
    label: 'Thinking',
    description: 'Reasoning, questions and problem framing',
    icon: '\u{1F4AD}',
    color: 0xf3bd4d,
    colStart: 0, colSpan: 4, rowStart: 0, rowSpan: 1,
    x: 0, y: 0, width: 0, height: 0,
  },
  {
    id: 'tasks',
    label: 'Plan',
    description: 'Architecture, task breakdown and implementation plans',
    icon: '\u{1F5FA}\uFE0F',
    color: 0x5c8fd6,
    colStart: 4, colSpan: 4, rowStart: 0, rowSpan: 1,
    x: 0, y: 0, width: 0, height: 0,
  },
  {
    id: 'search',
    label: 'Research',
    description: 'Search, investigation and evidence gathering',
    icon: '\u{1F50E}',
    color: 0x52b9a5,
    colStart: 8, colSpan: 4, rowStart: 0, rowSpan: 1,
    x: 0, y: 0, width: 0, height: 0,
  },

  // Row 1 — execution and quality gates
  {
    id: 'files',
    label: 'Build',
    description: 'Code, tests, CI changes and implementation work',
    icon: '\u{1F6E0}\uFE0F',
    color: 0x63ad68,
    colStart: 0, colSpan: 6, rowStart: 1, rowSpan: 1,
    x: 0, y: 0, width: 0, height: 0,
  },
  {
    id: 'messaging',
    label: 'Review / Judge',
    description: 'Review, validation, QA and final acceptance',
    icon: '\u{2696}\uFE0F',
    color: 0xe66f66,
    colStart: 6, colSpan: 3, rowStart: 1, rowSpan: 1,
    x: 0, y: 0, width: 0, height: 0,
  },
  {
    id: 'web',
    label: 'Security',
    description: 'Security review, hardening, risk and compliance checks',
    icon: '\u{1F6E1}\uFE0F',
    color: 0x8c79c6,
    colStart: 9, colSpan: 3, rowStart: 1, rowSpan: 1,
    x: 0, y: 0, width: 0, height: 0,
  },

  // Row 2 — platform operations and orchestration
  {
    id: 'terminal',
    label: 'Deploy / Ops',
    description: 'Platform, infrastructure, release and operations work',
    icon: '\u{1F680}',
    color: 0x4e98b8,
    colStart: 0, colSpan: 4, rowStart: 2, rowSpan: 1,
    x: 0, y: 0, width: 0, height: 0,
  },
  {
    id: 'spawn',
    label: 'Orchestrate',
    description: 'Agent spawning, delegation and multi-agent coordination',
    icon: '\u{1F9ED}',
    color: 0xd99955,
    colStart: 4, colSpan: 4, rowStart: 2, rowSpan: 1,
    x: 0, y: 0, width: 0, height: 0,
  },
  {
    id: 'idle',
    label: 'Idle',
    description: 'Agents waiting for their next mission',
    icon: '\u{1F4A4}',
    color: 0x829477,
    colStart: 8, colSpan: 4, rowStart: 2, rowSpan: 1,
    x: 0, y: 0, width: 0, height: 0,
  },
];

export const ZONE_MAP = new Map(ZONES.map((z) => [z.id, z]));

/** Dynamic world dimensions — updated by LayoutEngine */
let _worldWidth = 1100;
let _worldHeight = 980;

export function setWorldSize(w: number, h: number): void {
  _worldWidth = w;
  _worldHeight = h;
}

export const WORLD_WIDTH_GETTER = { get value() { return _worldWidth; } };
export const WORLD_HEIGHT_GETTER = { get value() { return _worldHeight; } };

/** Legacy static exports — for backward compat in files that import them */
export let WORLD_WIDTH = 1100;
export let WORLD_HEIGHT = 980;

export function updateWorldExports(w: number, h: number): void {
  WORLD_WIDTH = w;
  WORLD_HEIGHT = h;
  _worldWidth = w;
  _worldHeight = h;
}
