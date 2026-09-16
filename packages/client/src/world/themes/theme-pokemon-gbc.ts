import { Graphics } from 'pixi.js';
import { ZONES } from '@agent-move/shared';
import type { ZoneId } from '@agent-move/shared';
import type { Theme, ZoneDecoratorFn } from './theme-types.js';

/**
 * Game Boy Color / monster-training-RPG inspired theme.
 *
 * Everything is rendered with Pixi primitives so AgentMove does not ship or
 * depend on copyrighted game assets. The palette, chunky pixels, overworld
 * grass, route paths and lab/center silhouettes provide the nostalgic feel.
 */
const PX = 4;
const P = (n: number) => n * PX;

const C = {
  ink: 0x17333a,
  inkSoft: 0x31505a,
  cream: 0xf4edc7,
  creamDark: 0xd9cf9f,
  white: 0xfff9dd,
  grass: 0x78bd61,
  grassDark: 0x549c52,
  grassLight: 0x9cd66f,
  grassShadow: 0x3f7f4a,
  path: 0xe8cf8c,
  pathLight: 0xf3dfaa,
  pathDark: 0xc9aa67,
  water: 0x55a7cf,
  waterLight: 0x85cee6,
  waterDark: 0x387fba,
  red: 0xd95b58,
  redDark: 0xa33f47,
  blue: 0x5b88c8,
  blueDark: 0x38649f,
  green: 0x5ea768,
  greenDark: 0x3c7d58,
  yellow: 0xe4bd4f,
  violet: 0x8b72b6,
  orange: 0xd68c4b,
  metal: 0x82959a,
  metalDark: 0x526b72,
  screen: 0x2c5258,
  screenGlow: 0x83cf9b,
};

function px(g: Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.rect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))).fill(color);
}

function outlineBox(g: Graphics, x: number, y: number, w: number, h: number, fill: number, edge = C.ink): void {
  px(g, x, y, w, h, edge);
  px(g, x + PX, y + PX, w - PX * 2, h - PX * 2, fill);
  px(g, x + PX * 2, y + PX * 2, w - PX * 4, PX, C.white);
}

function drawScreen(g: Graphics, x: number, y: number, w = P(12), h = P(8), accent = C.screenGlow): void {
  outlineBox(g, x, y, w, h, C.metalDark);
  px(g, x + P(2), y + P(2), w - P(4), h - P(4), C.screen);
  px(g, x + P(3), y + P(3), w - P(7), PX, accent);
  px(g, x + P(3), y + P(5), P(4), PX, accent);
  px(g, x + P(8), y + P(5), P(2), PX, C.yellow);
}

function drawDesk(g: Graphics, x: number, y: number, w = P(18)): void {
  px(g, x, y, w, P(5), C.creamDark);
  px(g, x, y, w, PX, C.inkSoft);
  px(g, x + PX, y + P(4), w - PX * 2, PX, C.pathDark);
  px(g, x + P(2), y + P(5), P(2), P(4), C.inkSoft);
  px(g, x + w - P(4), y + P(5), P(2), P(4), C.inkSoft);
}

function drawChair(g: Graphics, x: number, y: number, color = C.red): void {
  px(g, x, y, P(5), P(4), C.ink);
  px(g, x + PX, y + PX, P(3), P(2), color);
  px(g, x + PX, y + P(4), PX, P(2), C.ink);
  px(g, x + P(3), y + P(4), PX, P(2), C.ink);
}

function drawBoard(g: Graphics, x: number, y: number, w: number, h: number, accent: number): void {
  outlineBox(g, x, y, w, h, C.cream);
  px(g, x + P(2), y + P(2), w - P(4), PX, accent);
  for (let row = 0; row < 3; row++) {
    const yy = y + P(4 + row * 3);
    if (yy + PX >= y + h - P(1)) break;
    px(g, x + P(2), yy, P(2), P(2), row === 2 ? C.green : accent);
    px(g, x + P(5), yy, Math.max(P(4), w - P(8)), PX, C.inkSoft);
  }
}

function drawRack(g: Graphics, x: number, y: number, w = P(8), h = P(18)): void {
  outlineBox(g, x, y, w, h, C.metalDark);
  for (let yy = y + P(3); yy < y + h - P(2); yy += P(4)) {
    px(g, x + P(2), yy, w - P(4), P(2), C.inkSoft);
    px(g, x + P(3), yy + PX / 2, PX, PX, C.screenGlow);
    px(g, x + w - P(4), yy + PX / 2, PX, PX, C.yellow);
  }
}

function drawPlant(g: Graphics, x: number, y: number): void {
  px(g, x + P(2), y + P(5), P(4), P(4), C.orange);
  px(g, x + P(1), y + P(3), P(3), P(3), C.greenDark);
  px(g, x + P(4), y + P(2), P(3), P(4), C.green);
  px(g, x + P(3), y, P(2), P(5), C.grassLight);
}

function drawShield(g: Graphics, x: number, y: number, size = P(10)): void {
  const u = Math.max(P(1), Math.floor(size / 5));
  px(g, x + u, y, size - u * 2, u, C.ink);
  px(g, x, y + u, size, u * 2, C.ink);
  px(g, x + u, y + u * 3, size - u * 2, u, C.ink);
  px(g, x + u * 2, y + u * 4, size - u * 4, u, C.ink);
  px(g, x + u, y + u, size - u * 2, u * 2, C.violet);
  px(g, x + u * 2, y + u * 3, size - u * 4, u, C.violet);
  px(g, x + size / 2 - PX / 2, y + u, PX, u * 3, C.white);
}

function drawHub(g: Graphics, cx: number, cy: number): void {
  const s = P(9);
  // Chunky red/white capsule motif — deliberately generic, not an imported asset.
  px(g, cx - s, cy - P(5), s * 2, P(4), C.ink);
  px(g, cx - s - PX, cy - PX, s * 2 + PX * 2, P(2), C.ink);
  px(g, cx - s, cy - P(5) + PX, s * 2, P(4) - PX, C.red);
  px(g, cx - s, cy + PX, s * 2, P(4), C.white);
  px(g, cx - s - PX, cy - PX, s * 2 + PX * 2, P(2), C.cream);
  px(g, cx - P(3), cy - P(3), P(6), P(6), C.ink);
  px(g, cx - P(2), cy - P(2), P(4), P(4), C.white);
  px(g, cx - PX, cy - PX, P(2), P(2), C.screenGlow);
}

function drawTree(g: Graphics, cx: number, cy: number, variant = 0): void {
  const dark = variant % 2 === 0 ? C.grassShadow : C.greenDark;
  px(g, cx - PX, cy + P(3), P(2), P(4), C.orange);
  px(g, cx - P(4), cy - P(3), P(8), P(6), C.ink);
  px(g, cx - P(5), cy - PX, P(10), P(4), C.ink);
  px(g, cx - P(4) + PX, cy - P(3) + PX, P(8) - P(2), P(5), dark);
  px(g, cx - P(4), cy, P(8), P(2), C.green);
  px(g, cx - P(2), cy - P(2), P(3), P(2), C.grassLight);
}

function drawFlower(g: Graphics, x: number, y: number, color: number): void {
  px(g, x, y + PX, PX, PX, color);
  px(g, x + PX * 2, y + PX, PX, PX, color);
  px(g, x + PX, y, PX, PX, color);
  px(g, x + PX, y + PX * 2, PX, PX, color);
  px(g, x + PX, y + PX, PX, PX, C.yellow);
}

function drawWater(g: Graphics, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, h, C.water);
  for (let yy = y + P(2); yy < y + h - P(1); yy += P(5)) {
    for (let xx = x + P(2); xx < x + w - P(4); xx += P(9)) {
      px(g, xx, yy, P(4), PX, C.waterLight);
      px(g, xx + P(2), yy + PX, P(4), PX, C.waterDark);
    }
  }
}

function renderPokemonGrid(g: Graphics, worldW: number, worldH: number): void {
  // Grass base with deterministic 8-bit checker noise.
  px(g, 0, 0, worldW, worldH, C.grass);
  for (let y = 0; y < worldH; y += P(8)) {
    for (let x = 0; x < worldW; x += P(8)) {
      const v = ((x / P(8)) * 13 + (y / P(8)) * 7) % 11;
      if (v === 0 || v === 3) px(g, x, y, P(2), P(2), C.grassDark);
      if (v === 6) px(g, x + P(4), y + P(3), P(2), PX, C.grassLight);
    }
  }

  // Water corners give the map a classic route/overworld silhouette.
  const waterW = Math.min(P(18), worldW * 0.12);
  drawWater(g, 0, 0, waterW, worldH);
  drawWater(g, worldW - waterW, 0, waterW, worldH);

  if (ZONES.length === 0) return;
  const minX = Math.min(...ZONES.map(z => z.x));
  const minY = Math.min(...ZONES.map(z => z.y));
  const maxX = Math.max(...ZONES.map(z => z.x + z.width));
  const maxY = Math.max(...ZONES.map(z => z.y + z.height));

  // Sandy route wrapping the operations center.
  const route = P(4);
  px(g, minX - route, minY - route, maxX - minX + route * 2, maxY - minY + route * 2, C.pathDark);
  px(g, minX - route + PX, minY - route + PX, maxX - minX + route * 2 - PX * 2, maxY - minY + route * 2 - PX * 2, C.path);

  // Main southern path / entrance.
  const entryW = P(18);
  px(g, worldW / 2 - entryW / 2, maxY, entryW, Math.max(0, worldH - maxY), C.path);
  px(g, worldW / 2 - entryW / 2, maxY, PX, Math.max(0, worldH - maxY), C.pathDark);
  px(g, worldW / 2 + entryW / 2 - PX, maxY, PX, Math.max(0, worldH - maxY), C.pathDark);

  // Tree rows along the water edges and some flowers around the building.
  let variant = 0;
  for (let y = P(7); y < worldH - P(6); y += P(18)) {
    drawTree(g, waterW + P(5), y, variant++);
    drawTree(g, worldW - waterW - P(5), y + P(7), variant++);
  }
  const flowerColors = [C.red, C.yellow, C.violet, C.white];
  for (let i = 0; i < 10; i++) {
    const fx = minX + P(4) + ((i * 47) % Math.max(P(6), (maxX - minX - P(8))));
    const fy = i % 2 === 0 ? minY - P(7) : maxY + P(3);
    if (fy > P(2) && fy < worldH - P(3)) drawFlower(g, fx, fy, flowerColors[i % flowerColors.length]);
  }
}

const decorators: Record<ZoneId, ZoneDecoratorFn> = {
  // Research lab: terminals + reference board.
  search: (g, x, y, w, h) => {
    drawBoard(g, x + P(2), y + P(3), Math.min(P(25), w * 0.42), Math.min(P(16), h * 0.45), C.green);
    drawDesk(g, x + w * 0.54, y + h * 0.26, Math.min(P(22), w * 0.38));
    drawScreen(g, x + w * 0.58, y + h * 0.13, P(12), P(8), C.green);
    drawChair(g, x + w * 0.66, y + h * 0.55, C.green);
    drawPlant(g, x + w - P(10), y + h - P(12));
  },

  // Deploy/Ops: racks, status screens and platform console.
  terminal: (g, x, y, w, h) => {
    drawRack(g, x + P(2), y + P(3), P(8), Math.min(P(18), h - P(7)));
    drawRack(g, x + P(12), y + P(3), P(8), Math.min(P(18), h - P(7)));
    drawScreen(g, x + w * 0.58, y + P(4), Math.min(P(15), w * 0.34), P(9), C.screenGlow);
    drawDesk(g, x + w * 0.5, y + h * 0.56, Math.min(P(20), w * 0.42));
  },

  // Security: shield station and risk console.
  web: (g, x, y, w, h) => {
    drawShield(g, x + w * 0.5 - P(5), y + P(4), P(10));
    drawScreen(g, x + P(2), y + h * 0.52, Math.min(P(14), w * 0.42), P(8), C.violet);
    drawBoard(g, x + w * 0.55, y + h * 0.47, Math.min(P(13), w * 0.38), P(10), C.red);
  },

  // Build: large implementation floor with several workstations.
  files: (g, x, y, w, h) => {
    const stationW = Math.min(P(22), (w - P(12)) / 3);
    for (let i = 0; i < 3; i++) {
      const sx = x + P(3) + i * ((w - P(6)) / 3);
      drawScreen(g, sx + P(2), y + P(4), Math.max(P(10), stationW - P(4)), P(8), i === 1 ? C.yellow : C.green);
      drawDesk(g, sx, y + P(13), stationW);
      drawChair(g, sx + stationW / 2 - P(2), y + P(19), i === 1 ? C.blue : C.red);
    }
    drawBoard(g, x + w * 0.36, y + h - P(15), Math.min(P(32), w * 0.3), P(11), C.green);
    drawPlant(g, x + w - P(10), y + h - P(12));
  },

  // Thinking: one round-ish central ideation table plus scratch screens.
  thinking: (g, x, y, w, h) => {
    const cx = x + w / 2;
    const cy = y + h * 0.55;
    px(g, cx - P(10), cy - P(5), P(20), P(10), C.ink);
    px(g, cx - P(9), cy - P(4), P(18), P(8), C.cream);
    px(g, cx - P(6), cy - P(2), P(5), P(4), C.yellow);
    px(g, cx + P(1), cy - P(2), P(5), P(4), C.blue);
    drawChair(g, cx - P(15), cy - P(2), C.yellow);
    drawChair(g, cx + P(11), cy - P(2), C.yellow);
    drawBoard(g, x + P(3), y + P(3), Math.min(P(20), w * 0.38), P(11), C.yellow);
  },

  // Review/Judge: paired reviewer desks and acceptance board.
  messaging: (g, x, y, w, h) => {
    drawBoard(g, x + P(2), y + P(3), Math.min(P(17), w - P(4)), P(13), C.red);
    drawScreen(g, x + P(3), y + h * 0.52, Math.min(P(12), w * 0.42), P(8), C.green);
    drawScreen(g, x + w * 0.55, y + h * 0.52, Math.min(P(12), w * 0.4), P(8), C.red);
    px(g, x + w / 2 - PX, y + h * 0.55, P(2), P(12), C.inkSoft);
  },

  // Orchestrate: central hub with satellite consoles.
  spawn: (g, x, y, w, h) => {
    const cx = x + w / 2;
    const cy = y + h / 2;
    drawHub(g, cx, cy - P(1));
    drawScreen(g, x + P(2), y + P(3), P(11), P(7), C.orange);
    drawScreen(g, x + w - P(13), y + P(3), P(11), P(7), C.blue);
    px(g, x + P(12), cy, Math.max(P(3), cx - x - P(21)), PX, C.orange);
    px(g, cx + P(9), cy, Math.max(P(3), x + w - cx - P(21)), PX, C.blue);
  },

  // Idle: quiet center/lounge.
  idle: (g, x, y, w, h) => {
    outlineBox(g, x + P(2), y + P(3), Math.min(P(25), w * 0.5), P(9), C.cream);
    px(g, x + P(4), y + P(6), Math.min(P(19), w * 0.38), P(2), C.red);
    for (let i = 0; i < 2; i++) {
      const sx = x + w * (0.55 + i * 0.18);
      px(g, sx, y + h * 0.55, P(8), P(4), C.ink);
      px(g, sx + PX, y + h * 0.55 + PX, P(6), P(2), C.blue);
    }
    drawPlant(g, x + w - P(10), y + P(3));
  },

  // Plan: roadmap board and planning workstations.
  tasks: (g, x, y, w, h) => {
    drawBoard(g, x + P(3), y + P(3), Math.min(P(28), w * 0.62), Math.min(P(17), h * 0.5), C.blue);
    drawScreen(g, x + w * 0.7, y + P(4), Math.min(P(13), w * 0.26), P(8), C.blue);
    drawDesk(g, x + w * 0.55, y + h * 0.58, Math.min(P(20), w * 0.38));
    drawChair(g, x + w * 0.68, y + h * 0.75, C.blue);
  },
};

export const pokemonGbcTheme: Theme = {
  id: 'pokemon-gbc',
  name: 'Pokémon GBC',
  icon: '🎮',
  colors: {
    background: C.grassDark,
    gridLine: C.grass,
    gridLineSub: C.grassLight,
  },
  decorators,
  gridRenderer: renderPokemonGrid,
  pixelRooms: true,
};
