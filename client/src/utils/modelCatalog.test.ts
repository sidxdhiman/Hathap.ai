import { describe, expect, it } from 'vitest';
import { CUSTOM_OPTION_ID, getPresetForProvider, PROVIDER_PRESETS } from './modelCatalog';

describe('modelCatalog', () => {
  it('looks up a provider preset case-insensitively', () => {
    expect(getPresetForProvider('openai')?.provider).toBe('OpenAI');
    expect(getPresetForProvider('OPENROUTER')?.provider).toBe('OpenRouter');
    expect(getPresetForProvider('Ollama (local)')?.provider).toBe('Ollama (local)');
  });

  it('returns undefined for unknown providers', () => {
    expect(getPresetForProvider('acme')).toBeUndefined();
    expect(getPresetForProvider('')).toBeUndefined();
  });

  it('exposes a custom-option sentinel distinct from every preset model id', () => {
    const allIds = PROVIDER_PRESETS.flatMap((preset) => preset.models.map((m) => m.id));
    expect(allIds).not.toContain(CUSTOM_OPTION_ID);
    expect(allIds.length).toBeGreaterThan(0);
  });

  it('every preset has a name and at least one model with a unique id', () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.provider.length).toBeGreaterThan(0);
      expect(preset.models.length).toBeGreaterThan(0);
      const ids = preset.models.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});