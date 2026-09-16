import type { Theme } from './theme-types.js';
import { pokemonGbcTheme } from './theme-pokemon-gbc.js';
import { officeTheme } from './theme-office.js';
import { spaceTheme } from './theme-space.js';
import { castleTheme } from './theme-castle.js';
import { cyberpunkTheme } from './theme-cyberpunk.js';
import { storageGet, storageSet } from '../../utils/storage.js';

// v2 intentionally migrates existing installs to the workflow-oriented default once.
const STORAGE_KEY = 'theme-v2';

export const ALL_THEMES: Theme[] = [pokemonGbcTheme, officeTheme, spaceTheme, castleTheme, cyberpunkTheme];

export class ThemeManager {
  private _current: Theme;
  private _onChange: ((theme: Theme) => void) | null = null;

  constructor() {
    const savedId = storageGet<string>(STORAGE_KEY, 'pokemon-gbc');
    this._current = ALL_THEMES.find(t => t.id === savedId) ?? pokemonGbcTheme;
  }

  get current(): Theme { return this._current; }

  setTheme(themeId: string): void {
    const theme = ALL_THEMES.find(t => t.id === themeId);
    if (!theme || theme.id === this._current.id) return;
    this._current = theme;
    storageSet(STORAGE_KEY, theme.id);
    this._onChange?.(theme);
  }

  onChange(handler: (theme: Theme) => void): void {
    this._onChange = handler;
  }

  cycleNext(): void {
    const idx = ALL_THEMES.indexOf(this._current);
    const next = ALL_THEMES[(idx + 1) % ALL_THEMES.length];
    this.setTheme(next.id);
  }
}
