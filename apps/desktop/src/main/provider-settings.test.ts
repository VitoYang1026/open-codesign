import { CodesignError, type Config, hydrateConfig } from '@open-codesign/shared';
import { describe, expect, it } from 'vitest';
import {
  assertProviderHasStoredSecret,
  computeDeleteProviderResult,
  getAddProviderDefaults,
  resolveActiveModel,
  toProviderRows,
} from './provider-settings';

function makeCfg(input: {
  provider: string;
  modelPrimary: string;
  secrets?: Record<string, { ciphertext: string }>;
  baseUrls?: Record<string, string>;
}): Config {
  const providers: Record<string, import('@open-codesign/shared').ProviderEntry> = {
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic Claude',
      builtin: true,
      wire: 'anthropic',
      baseUrl: input.baseUrls?.['anthropic'] ?? 'https://api.anthropic.com',
      defaultModel: 'claude-sonnet-4-6',
    },
    openai: {
      id: 'openai',
      name: 'OpenAI',
      builtin: true,
      wire: 'openai-chat',
      baseUrl: input.baseUrls?.['openai'] ?? 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o',
    },
    openrouter: {
      id: 'openrouter',
      name: 'OpenRouter',
      builtin: true,
      wire: 'openai-chat',
      baseUrl: input.baseUrls?.['openrouter'] ?? 'https://openrouter.ai/api/v1',
      defaultModel: 'anthropic/claude-sonnet-4.6',
    },
  };
  return hydrateConfig({
    version: 3,
    activeProvider: input.provider,
    activeModel: input.modelPrimary,
    secrets: input.secrets ?? {},
    providers,
  });
}

describe('getAddProviderDefaults', () => {
  it('activates the newly added provider when the cached active provider has no saved secret', () => {
    const cfg = makeCfg({ provider: 'openai', modelPrimary: 'gpt-4o' });

    const defaults = getAddProviderDefaults(cfg, {
      provider: 'anthropic',
      modelPrimary: 'claude-sonnet-4-6',
    });

    expect(defaults).toEqual({
      activeProvider: 'anthropic',
      modelPrimary: 'claude-sonnet-4-6',
    });
  });
});

describe('toProviderRows', () => {
  it('returns a row with error:decryption_failed and empty maskedKey when decrypt throws', () => {
    const cfg = makeCfg({
      provider: 'openai',
      modelPrimary: 'gpt-4o',
      secrets: { openai: { ciphertext: 'bad-ciphertext' } },
    });

    const rows = toProviderRows(cfg, () => {
      throw new Error('safeStorage unavailable');
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.error).toBe('decryption_failed');
    expect(rows[0]?.maskedKey).toBe('');
    expect(rows[0]?.provider).toBe('openai');
  });

  it('returns a normal masked row when decrypt succeeds', () => {
    const cfg = makeCfg({
      provider: 'anthropic',
      modelPrimary: 'claude-sonnet-4-6',
      secrets: { anthropic: { ciphertext: 'enc' } },
    });

    const rows = toProviderRows(cfg, () => 'sk-ant-api03-abcdefghijklmnop');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.error).toBeUndefined();
    expect(rows[0]?.maskedKey).toMatch(/sk-.*\*{3}/);
    expect(rows[0]?.isActive).toBe(true);
  });
});

describe('assertProviderHasStoredSecret', () => {
  it('throws when activating a provider without a stored API key', () => {
    const cfg = makeCfg({
      provider: 'openai',
      modelPrimary: 'gpt-4o',
      secrets: { openai: { ciphertext: 'ciphertext' } },
    });

    expect(() => assertProviderHasStoredSecret(cfg, 'anthropic')).toThrow(CodesignError);
  });
});

describe('computeDeleteProviderResult', () => {
  it('switches to the next provider default models when the active provider is deleted', () => {
    const cfg = makeCfg({
      provider: 'anthropic',
      modelPrimary: 'claude-sonnet-4-6',
      secrets: {
        anthropic: { ciphertext: 'enc-ant' },
        openai: { ciphertext: 'enc-oai' },
      },
    });

    const result = computeDeleteProviderResult(cfg, 'anthropic');

    expect(result.nextActive).toBe('openai');
    expect(result.modelPrimary).toBe('gpt-4o');
  });

  it('keeps existing models when a non-active provider is deleted', () => {
    const cfg = makeCfg({
      provider: 'anthropic',
      modelPrimary: 'claude-sonnet-4-6',
      secrets: {
        anthropic: { ciphertext: 'enc-ant' },
        openai: { ciphertext: 'enc-oai' },
      },
    });

    const result = computeDeleteProviderResult(cfg, 'openai');

    expect(result.nextActive).toBe('anthropic');
    expect(result.modelPrimary).toBe('claude-sonnet-4-6');
  });

  it('returns nextActive null and empty models when the last provider is deleted', () => {
    const cfg = makeCfg({
      provider: 'openai',
      modelPrimary: 'gpt-4o',
      secrets: { openai: { ciphertext: 'enc-oai' } },
    });

    const result = computeDeleteProviderResult(cfg, 'openai');

    expect(result.nextActive).toBeNull();
    expect(result.modelPrimary).toBe('');
  });
});

describe('resolveActiveModel', () => {
  const baseCfg = makeCfg({
    provider: 'openrouter',
    modelPrimary: 'anthropic/claude-sonnet-4.6',
    secrets: {
      openai: { ciphertext: 'enc-oai' },
      openrouter: { ciphertext: 'enc-or' },
    },
    baseUrls: { openai: 'https://api.duckcoding.ai/v1' },
  });

  it('returns the canonical active provider when the hint already matches', () => {
    const result = resolveActiveModel(baseCfg, {
      provider: 'openrouter',
      modelId: 'anthropic/claude-haiku-3',
    });

    expect(result.overridden).toBe(false);
    expect(result.model).toEqual({
      provider: 'openrouter',
      modelId: 'anthropic/claude-haiku-3',
    });
    // openrouter default base url is the builtin one
    expect(result.baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('snaps a stale hint back to the canonical active provider and modelPrimary', () => {
    const result = resolveActiveModel(baseCfg, {
      provider: 'openai',
      modelId: 'gpt-4o',
    });

    expect(result.overridden).toBe(true);
    expect(result.model).toEqual({
      provider: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4.6',
    });
    expect(result.baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('threads through the per-provider baseUrl for the canonical active', () => {
    const cfg = makeCfg({
      provider: 'openai',
      modelPrimary: 'gpt-4o',
      secrets: {
        openai: { ciphertext: 'enc-oai' },
      },
      baseUrls: { openai: 'https://api.duckcoding.ai/v1' },
    });
    const result = resolveActiveModel(cfg, { provider: 'openai', modelId: 'gpt-4o' });

    expect(result.overridden).toBe(false);
    expect(result.baseUrl).toBe('https://api.duckcoding.ai/v1');
  });

  it('ignores stale hint baseUrl entry and returns active provider baseUrl on override', () => {
    const cfg = makeCfg({
      provider: 'openrouter',
      modelPrimary: 'anthropic/claude-sonnet-4.6',
      secrets: {
        openai: { ciphertext: 'enc-oai' },
        openrouter: { ciphertext: 'enc-or' },
      },
      baseUrls: {
        openai: 'https://api.duckcoding.ai/v1',
        openrouter: 'https://openrouter.ai/api/v1',
      },
    });
    const result = resolveActiveModel(cfg, { provider: 'openai', modelId: 'gpt-4o' });

    expect(result.overridden).toBe(true);
    expect(result.model.provider).toBe('openrouter');
    expect(result.baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('returns canonical openrouter baseUrl when stale hint says openai+duckcoding', () => {
    const result = resolveActiveModel(baseCfg, { provider: 'openai', modelId: 'gpt-4o' });

    expect(result.overridden).toBe(true);
    expect(result.model.provider).toBe('openrouter');
    expect(result.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(result.baseUrl).not.toBe('https://api.duckcoding.ai/v1');
  });

  it('throws PROVIDER_KEY_MISSING when the active provider has no stored secret', () => {
    const cfg = makeCfg({
      provider: 'anthropic',
      modelPrimary: 'claude-sonnet-4-6',
      secrets: {
        openai: { ciphertext: 'enc-oai' },
        openrouter: { ciphertext: 'enc-or' },
      },
    });
    expect(() =>
      resolveActiveModel(cfg, { provider: 'anthropic', modelId: 'claude-sonnet-4-6' }),
    ).toThrowError(CodesignError);
  });
});
