import type { AgentPalette, AgentState, ZoneId } from '@agent-move/shared';
import type { PaletteKey, SpriteFrame, SpriteSet } from './sprite-data.js';

export type PokemonAvatarId =
  | 'pikachu'
  | 'charmander'
  | 'bulbasaur'
  | 'squirtle'
  | 'alakazam'
  | 'gengar'
  | 'mew'
  | 'psyduck'
  | 'snorlax';

export interface PokemonAvatar {
  id: PokemonAvatarId;
  name: string;
  palette: AgentPalette;
  sprites: SpriteSet;
}

const SIZE = 16;
const PIXELS: Record<string, PaletteKey> = {
  '.': 'transparent',
  o: 'outline',
  b: 'body',
  h: 'highlight',
  e: 'eye',
  s: 'skin',
};

function frame(lines: string[]): SpriteFrame {
  return Array.from({ length: SIZE }, (_, y) => {
    const line = (lines[y] ?? '').replace(/\s/g, '.').padEnd(SIZE, '.').slice(0, SIZE);
    return [...line].map((ch) => PIXELS[ch] ?? 'transparent');
  });
}

function spriteSet(base: SpriteFrame): SpriteSet {
  return {
    idle: [base, base],
    walk: [base, base],
    working: base,
    sleeping: [base, base],
    done: base,
    size: SIZE,
  };
}

const PIKACHU = spriteSet(frame([
  '..o..........o..',
  '.obo........obo..',
  '.obbo......obbo..',
  '..obbo....obbo...',
  '...obbbbbbbbo....',
  '..obbbbbbbbbbo...',
  '.obbe bbb ebbbo..',
  '.obbhbbbbhbbbbo..',
  '.obbbbbbbbbbbbo..',
  '..obbbbbbbbbbo...',
  '...obbbbbbbbo....',
  '....obbbbbbo.....',
  '...oob....boo....',
  '..obbo....obbo...',
  '..oo........oo...',
  '................',
]));

const CHARMANDER = spriteSet(frame([
  '......oo........',
  '....oobbbo......',
  '...obbbbbbo.....',
  '..obbe bbebbo...',
  '..obbbbbbbbbo...',
  '..obbsbbbbo.....',
  '...obbbbbbo.....',
  '....obbbbbo.....',
  '...obbbbbbbbo...',
  '..obbbbbbbbbbo..',
  '..obbbsbbbbo....',
  '...obbbbbbo.....',
  '..oobbo.obboo...',
  '..obbo...obbo...',
  '...oo.....oo....',
  '............h...',
]));

const BULBASAUR = spriteSet(frame([
  '.....hhhh.......',
  '...ohhhhhho.....',
  '..ohhhhhhhhho...',
  '..obbbbbbbbbo...',
  '.obbe bbb ebbo..',
  '.obbbbbbbbbbbbo..',
  '..obbsbbbbbbbo...',
  '...obbbbbbbbo....',
  '..obbbbbbbbbbo...',
  '.obbbbbbbbbbbbo..',
  '.obbsbbsbbsbbbo..',
  '..obbbbbbbbbbo...',
  '..oobbo..obboo...',
  '.obbo......obbo..',
  '.oo..........oo..',
  '................',
]));

const SQUIRTLE = spriteSet(frame([
  '.....oooo.......',
  '...oobbbboo.....',
  '..obbbbbbbbbo...',
  '..obbe bbebbo...',
  '..obbbbbbbbbo...',
  '...obbsbbbo.....',
  '....obbbbo......',
  '..oohhhhhoo.....',
  '.ohhhhhhhhhho...',
  '.ohhbbbbbbhhho..',
  '..ohbbbbbbhho...',
  '...ohbbbbhho....',
  '..oobbo..obboo...',
  '.obbo......obbo..',
  '.oo..........oo..',
  '................',
]));

const ALAKAZAM = spriteSet(frame([
  '..o..........o..',
  '.obbo......obbo..',
  '..obbo....obbo...',
  '...obbbbbbbbo....',
  '..obbbbbbbbbbo...',
  '.obbe bbb ebbo..',
  '.obbbbbbbbbbbbo..',
  '..ohhbbbbb hho...',
  '..ohhhhhhhhho....',
  '.ohhhbbbbhhhho...',
  '.ohbbbbbbbbhho...',
  '..obbbbbbbbbo....',
  '.oobbo....obboo..',
  'obbo........obbo.',
  '.oo..........oo..',
  '................',
]));

const GENGAR = spriteSet(frame([
  '..o..o..o..o....',
  '.obobbbbbobo.....',
  '.obbbbbbbbbbo....',
  'obbbbbbbbbbbbo...',
  'obbe bbbb ebbo...',
  'obbbbbbbbbbbbo...',
  'obbbssssbbbbo....',
  'obbbbbbbbbbbbo...',
  '.obbbbbbbbbbo....',
  '..obbbbbbbbo.....',
  '.obbbbbbbbbbo....',
  'obbbbbbbbbbbbo...',
  'obboobboobboob...',
  '.oo..oo..oo.....',
  '................',
  '................',
]));

const MEW = spriteSet(frame([
  '.....oo.........',
  '...oobbbo.......',
  '..obbbbbbo.......',
  '..obbe bebo......',
  '..obbbbbbo.......',
  '...obbbbo........',
  '....obbo.........',
  '...obbbbbo.......',
  '..obbbbbbbbo.....',
  '..obbbbbbbbo.....',
  '...obbbbbbo......',
  '....obbbbo.......',
  '...oob..boo......',
  '..obbo..obbo.....',
  '..oo......oo.....',
  '..........oooooo',
]));

const PSYDUCK = spriteSet(frame([
  '.....o..o.......',
  '....ob..bo......',
  '...obbbbbbo.....',
  '..obbbbbbbbbo...',
  '..obbe bbebbo...',
  '..obbbbbbbbbo...',
  '...ohhhhho......',
  '....ohhho.......',
  '...obbbbbbo.....',
  '..obbbbbbbbbo...',
  '..obbbbbbbbbo...',
  '...obbbbbbo.....',
  '..oobbo.obboo...',
  '..obbo...obbo...',
  '...oo.....oo....',
  '................',
]));

const SNORLAX = spriteSet(frame([
  '.....oooo.......',
  '...oobbbboo.....',
  '..obbbbbbbbbo...',
  '.obbbbbbbbbbbbo..',
  '.obbs ssss sbbo..',
  'obbsse ssessbbbo.',
  'obssssssssssbbbo.',
  'obssssssssssbbbo.',
  'obbbbbbbbbbbbbo..',
  'obbbbbbbbbbbbbo..',
  '.obbbbbbbbbbbbo..',
  '..obbbbbbbbbbo...',
  '.oobbo......obboo',
  'obbo..........obb',
  '.oo............oo',
  '................',
]));

const PALETTES: Record<PokemonAvatarId, AgentPalette> = {
  pikachu:    { name: 'pikachu', body: 0xf4d54c, outline: 0x493727, highlight: 0xd9574f, eye: 0x111111, skin: 0xffef9b },
  charmander: { name: 'charmander', body: 0xee8240, outline: 0x5a3627, highlight: 0xf3ce49, eye: 0x2b88a6, skin: 0xffb56f },
  bulbasaur:  { name: 'bulbasaur', body: 0x6bc4a0, outline: 0x355b53, highlight: 0x5e9e55, eye: 0xc94f50, skin: 0x9bd78a },
  squirtle:   { name: 'squirtle', body: 0x75c7dd, outline: 0x3d5a64, highlight: 0x8a633f, eye: 0x342a27, skin: 0xefd695 },
  alakazam:   { name: 'alakazam', body: 0xe3b84b, outline: 0x5b4630, highlight: 0x8c6b47, eye: 0x151515, skin: 0xf5d56f },
  gengar:     { name: 'gengar', body: 0x7562a8, outline: 0x352c58, highlight: 0x9a86c6, eye: 0xe54d58, skin: 0xffffff },
  mew:        { name: 'mew', body: 0xe8a7bf, outline: 0x8d5c79, highlight: 0xf4cad8, eye: 0x3d73bc, skin: 0xffffff },
  psyduck:    { name: 'psyduck', body: 0xe6c44e, outline: 0x4a4337, highlight: 0xf1e2b8, eye: 0x111111, skin: 0xd39d42 },
  snorlax:    { name: 'snorlax', body: 0x4e7e79, outline: 0x293d3d, highlight: 0xe8dfbe, eye: 0x111111, skin: 0xe8dfbe },
};

const SPRITES: Record<PokemonAvatarId, SpriteSet> = {
  pikachu: PIKACHU,
  charmander: CHARMANDER,
  bulbasaur: BULBASAUR,
  squirtle: SQUIRTLE,
  alakazam: ALAKAZAM,
  gengar: GENGAR,
  mew: MEW,
  psyduck: PSYDUCK,
  snorlax: SNORLAX,
};

const NAMES: Record<PokemonAvatarId, string> = {
  pikachu: 'Pikachu',
  charmander: 'Salamèche',
  bulbasaur: 'Bulbizarre',
  squirtle: 'Carapuce',
  alakazam: 'Alakazam',
  gengar: 'Ectoplasma',
  mew: 'Mew',
  psyduck: 'Psykokwak',
  snorlax: 'Ronflex',
};

const FALLBACK_POOL: PokemonAvatarId[] = [
  'pikachu', 'charmander', 'bulbasaur', 'squirtle', 'alakazam', 'gengar', 'mew', 'psyduck', 'snorlax',
];

const ROLE_MATCHERS: Array<[RegExp, PokemonAvatarId]> = [
  [/\b(orchestr|coordin|supervisor|dispatcher|team[- ]?lead)\w*/i, 'pikachu'],
  [/\b(writer|builder|build|coder|developer|implement|refactor|fix)\w*/i, 'charmander'],
  [/\b(plan|architect|design|spec)\w*/i, 'bulbasaur'],
  [/\b(deploy|platform|infra|sre|ops|release|kubernetes|k8s|terraform|terragrunt|argocd|helm|ansible)\w*/i, 'squirtle'],
  [/\b(review|reviewer|judge|critic|validator|quality|qa|acceptance)\w*/i, 'alakazam'],
  [/\b(security|securit[eé]|vuln|hardening|pentest|risk|compliance)\w*/i, 'gengar'],
  [/\b(research|investigat|analyst|analysis|discovery|evidence|benchmark)\w*/i, 'mew'],
  [/\b(think|reason|brainstorm)\w*/i, 'psyduck'],
  [/\b(idle|sleep|rest)\w*/i, 'snorlax'],
];

const ZONE_FALLBACK: Record<ZoneId, PokemonAvatarId> = {
  thinking: 'psyduck',
  tasks: 'bulbasaur',
  search: 'mew',
  files: 'charmander',
  messaging: 'alakazam',
  web: 'gengar',
  terminal: 'squirtle',
  spawn: 'pikachu',
  idle: 'snorlax',
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function selectPokemonId(agent: AgentState): PokemonAvatarId {
  if (agent.role === 'team-lead') return 'pikachu';

  const identity = [agent.agentName, agent.taskDescription, agent.projectName]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  for (const [matcher, pokemon] of ROLE_MATCHERS) {
    if (matcher.test(identity)) return pokemon;
  }

  if (agent.currentZone && ZONE_FALLBACK[agent.currentZone]) {
    const hasUsefulIdentity = Boolean(agent.agentName || agent.taskDescription);
    if (hasUsefulIdentity) return ZONE_FALLBACK[agent.currentZone];
  }

  const key = agent.agentName || agent.sessionId || agent.id;
  return FALLBACK_POOL[stableHash(key) % FALLBACK_POOL.length];
}

export function getPokemonAvatarForAgent(agent: AgentState): PokemonAvatar {
  const id = selectPokemonId(agent);
  return {
    id,
    name: NAMES[id],
    palette: PALETTES[id],
    sprites: SPRITES[id],
  };
}
