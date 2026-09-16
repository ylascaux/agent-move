import type { AgentPalette, AgentState } from '@agent-move/shared';
import { AgentSprite as BaseAgentSprite } from './agent-sprite-base.js';
import type { SpeechMessage } from './agent-sprite-base.js';
import { createSpriteTexture, spriteKey } from '../sprites/sprite-factory.js';
import {
  getPokemonAvatarForAgent,
  type PokemonAvatar,
} from '../sprites/pokemon-sprites.js';

export type { SpeechMessage } from './agent-sprite-base.js';

/**
 * Pokemon-backed AgentMove sprite.
 *
 * The original AgentSprite remains untouched in agent-sprite-base.ts and still
 * owns every behavior: movement, idle/sleep, speech, planning/waiting badges,
 * activity rings, context health, anomalies, completion sparkles and clicks.
 * This subclass only swaps the generated character textures.
 */
export class AgentSprite extends BaseAgentSprite {
  private avatar: PokemonAvatar;
  private agentSnapshot: AgentState;
  private rendererRef: any;

  constructor(agent: AgentState, palette: AgentPalette, renderer: any) {
    super(agent, palette, renderer);
    this.agentSnapshot = { ...agent };
    this.rendererRef = renderer;
    this.avatar = getPokemonAvatarForAgent(agent);
    this.applyPokemonTextures();
  }

  /**
   * Keep the public customization API compatible. Pokemon use their canonical
   * colors, so changing an AgentMove color no longer recolors the character.
   */
  override rebuildTextures(_palette: AgentPalette, _colorIndex: number, renderer: any): void {
    this.rendererRef = renderer;
    this.applyPokemonTextures();
  }

  /**
   * Agent identities can be discovered after the initial session appears.
   * AgentManager refreshes the visible name on every update, so use that signal
   * to upgrade a fallback Pokemon to its role-specific Pokemon when possible.
   */
  override setCustomName(name: string): void {
    super.setCustomName(name);
    if (!name || name === this.agentSnapshot.agentName) return;

    this.agentSnapshot = { ...this.agentSnapshot, agentName: name };
    const next = getPokemonAvatarForAgent(this.agentSnapshot);
    if (next.id === this.avatar.id) return;

    this.avatar = next;
    this.applyPokemonTextures();
  }

  /** Current Pokemon species, useful for future hover/detail UI. */
  getPokemonName(): string {
    return this.avatar.name;
  }

  private applyPokemonTextures(): void {
    const spriteSet = this.avatar.sprites;
    const palette = this.avatar.palette;
    const keyPrefix = `pokemon_${this.avatar.id}`;

    const textures = {
      idle: [
        createSpriteTexture(this.rendererRef, spriteSet.idle[0], palette, spriteKey(`${keyPrefix}_idle0`, 0)),
        createSpriteTexture(this.rendererRef, spriteSet.idle[1], palette, spriteKey(`${keyPrefix}_idle1`, 0)),
      ],
      walk: [
        createSpriteTexture(this.rendererRef, spriteSet.walk[0], palette, spriteKey(`${keyPrefix}_walk0`, 0)),
        createSpriteTexture(this.rendererRef, spriteSet.walk[1], palette, spriteKey(`${keyPrefix}_walk1`, 0)),
      ],
      working: createSpriteTexture(this.rendererRef, spriteSet.working, palette, spriteKey(`${keyPrefix}_working`, 0)),
      sleeping: [
        createSpriteTexture(this.rendererRef, spriteSet.sleeping[0], palette, spriteKey(`${keyPrefix}_sleeping0`, 0)),
        createSpriteTexture(this.rendererRef, spriteSet.sleeping[1], palette, spriteKey(`${keyPrefix}_sleeping1`, 0)),
      ],
      done: createSpriteTexture(this.rendererRef, spriteSet.done, palette, spriteKey(`${keyPrefix}_done`, 0)),
    };

    // The base implementation uses TypeScript private fields rather than JS
    // #private fields. Runtime substitution lets us preserve all of its behavior
    // without forking the animation/state machine.
    const base = this as unknown as {
      textures: typeof textures;
      sprite: { texture: (typeof textures.idle)[number] };
    };
    base.textures = textures;
    base.sprite.texture = textures.idle[0];
  }
}
