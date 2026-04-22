import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DISMISSED_BANNER_PREFIX,
  applyLocaleChange,
  performImportGemini,
  performImportOpencode,
  readDismissed,
  resolveGeminiBanner,
  resolveOpencodeBanner,
  writeDismissed,
} from './Settings';

vi.mock('@open-codesign/i18n', () => ({
  setLocale: vi.fn((locale: string) => Promise.resolve(locale)),
  useT: () => (key: string) => key,
}));

describe('applyLocaleChange', () => {
  it('calls locale IPC set, then applies the persisted locale via i18next', async () => {
    const { setLocale: mockSetLocale } = await import('@open-codesign/i18n');
    const mockLocaleApi = {
      set: vi.fn((_locale: string) => Promise.resolve('zh-CN')),
    };

    const result = await applyLocaleChange('zh-CN', mockLocaleApi);

    expect(mockLocaleApi.set).toHaveBeenCalledWith('zh-CN');
    expect(mockSetLocale).toHaveBeenCalledWith('zh-CN');
    expect(result).toBe('zh-CN');
  });

  it('applies the locale returned by the IPC bridge, not the requested locale', async () => {
    const { setLocale: mockSetLocale } = await import('@open-codesign/i18n');
    // Bridge normalises 'zh' → 'zh-CN'
    const mockLocaleApi = {
      set: vi.fn((_locale: string) => Promise.resolve('zh-CN')),
    };

    const result = await applyLocaleChange('zh', mockLocaleApi);

    expect(mockLocaleApi.set).toHaveBeenCalledWith('zh');
    expect(mockSetLocale).toHaveBeenCalledWith('zh-CN');
    expect(result).toBe('zh-CN');
  });
});

describe('resolveGeminiBanner', () => {
  it('returns an importable view when a gemini-env key was detected', () => {
    // Mirrors `detectExternalConfigs` returning a gemini.env-sourced key —
    // this is the happy path where the user clicks "Import" and we call
    // `importGeminiConfig` without any finishing steps.
    const view = resolveGeminiBanner({ hasApiKey: true, blocked: false, warnings: [] });
    expect(view).toEqual({
      kind: 'importable',
      labelKey: 'settings.providers.import.geminiFound',
    });
  });

  it('returns a no-key view when gemini CLI is installed but no key is set', () => {
    const view = resolveGeminiBanner({ hasApiKey: false, blocked: false, warnings: [] });
    expect(view).toEqual({
      kind: 'no-key',
      labelKey: 'settings.providers.import.geminiNoKey',
    });
  });

  it('returns a blocked view surfacing the first warning for Vertex AI configs', () => {
    // Vertex AI is the canonical blocked case — we refuse to import because
    // the auth model doesn't fit BYOK. The banner must render the reason
    // (first warning) and the caller must NOT render an import button.
    const view = resolveGeminiBanner({
      hasApiKey: true,
      blocked: true,
      warnings: ['Vertex AI detected; sign-in not supported'],
    });
    expect(view).toEqual({
      kind: 'blocked',
      warning: 'Vertex AI detected; sign-in not supported',
    });
  });

  it('falls back to a stable i18n key when blocked with no warnings', () => {
    // Defensive: even if the detector forgets to push a warning we still
    // render *something* so the banner isn't empty.
    const view = resolveGeminiBanner({ hasApiKey: false, blocked: true, warnings: [] });
    expect(view).toEqual({
      kind: 'blocked',
      warning: 'settings.providers.import.geminiBlocked',
    });
  });
});

describe('resolveOpencodeBanner', () => {
  it('returns an importable view carrying count and the provider-summary string', () => {
    const view = resolveOpencodeBanner({
      count: 3,
      providerLabels: ['OpenCode · Anthropic', 'OpenCode · OpenAI', 'OpenCode · Google'],
      blocked: false,
      warnings: [],
    });
    expect(view).toEqual({
      kind: 'importable',
      count: 3,
      providers: 'OpenCode · Anthropic, OpenCode · OpenAI, OpenCode · Google',
      labelKey: 'settings.providers.import.opencodeFound',
    });
  });

  it('truncates the provider list past 3 entries with a "+N more" suffix', () => {
    const view = resolveOpencodeBanner({
      count: 5,
      providerLabels: [
        'OpenCode · Anthropic',
        'OpenCode · OpenAI',
        'OpenCode · Google',
        'OpenCode · Mistral',
        'OpenCode · Groq',
      ],
      blocked: false,
      warnings: [],
    });
    expect(view).toMatchObject({
      kind: 'importable',
      providers: expect.stringMatching(/\+2 more$/),
    });
  });

  it('returns a blocked view when OpenCode has no importable providers', () => {
    // "All OAuth" / "all unsupported" / corrupt auth.json — the count is
    // zero but we still want to tell the user we saw something.
    const view = resolveOpencodeBanner({
      count: 0,
      providerLabels: [],
      blocked: true,
      warnings: ['All entries use OAuth; nothing to import'],
    });
    expect(view).toEqual({
      kind: 'blocked',
      warning: 'All entries use OAuth; nothing to import',
    });
  });

  it('falls back to a stable i18n key when blocked with no warnings', () => {
    const view = resolveOpencodeBanner({
      count: 0,
      providerLabels: [],
      blocked: true,
      warnings: [],
    });
    expect(view).toEqual({
      kind: 'blocked',
      warning: 'settings.providers.import.opencodeBlocked',
    });
  });
});

describe('performImportGemini / performImportOpencode', () => {
  it('invokes the gemini import IPC exactly once', async () => {
    const api = { importGeminiConfig: vi.fn().mockResolvedValue(undefined) };
    await performImportGemini(api);
    expect(api.importGeminiConfig).toHaveBeenCalledTimes(1);
  });

  it('invokes the opencode import IPC exactly once', async () => {
    const api = { importOpencodeConfig: vi.fn().mockResolvedValue(undefined) };
    await performImportOpencode(api);
    expect(api.importOpencodeConfig).toHaveBeenCalledTimes(1);
  });

  it('propagates IPC rejection so the calling handler can surface a toast', async () => {
    const api = {
      importGeminiConfig: vi.fn().mockRejectedValue(new Error('auth failed')),
    };
    await expect(performImportGemini(api)).rejects.toThrow('auth failed');
  });
});

describe('dismissed-banner storage', () => {
  // Stub `window.localStorage` directly rather than pulling in jsdom/happy-dom
  // just for these three specs. Keeps the desktop package test deps lean —
  // all we need is the Storage shape the helpers actually call.
  let originalWindow: unknown;
  function installStorage(impl: Storage | null): void {
    (globalThis as unknown as { window: { localStorage: Storage | null } }).window = {
      localStorage: impl as Storage,
    };
  }
  function createMemoryStorage(): Storage {
    const store = new Map<string, string>();
    return {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (k) => store.get(k) ?? null,
      key: (i) => Array.from(store.keys())[i] ?? null,
      removeItem: (k) => {
        store.delete(k);
      },
      setItem: (k, v) => {
        store.set(k, v);
      },
    };
  }

  beforeEach(() => {
    originalWindow = (globalThis as unknown as { window?: unknown }).window;
    installStorage(createMemoryStorage());
  });
  afterEach(() => {
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  });

  it('round-trips a dismissed flag under the expected key prefix', () => {
    writeDismissed('gemini');
    expect(window.localStorage.getItem(`${DISMISSED_BANNER_PREFIX}gemini`)).toBe('1');
    expect(readDismissed('gemini')).toBe(true);
    // Other banners stay unaffected — each kind gets its own key.
    expect(readDismissed('opencode')).toBe(false);
  });

  it('treats a missing entry as not-dismissed', () => {
    expect(readDismissed('opencode')).toBe(false);
  });

  it('returns false and does not throw when localStorage access fails', () => {
    const throwing: Storage = {
      ...createMemoryStorage(),
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {
        throw new Error('storage disabled');
      },
    };
    installStorage(throwing);
    expect(readDismissed('gemini')).toBe(false);
    // writeDismissed must also swallow the error.
    expect(() => writeDismissed('gemini')).not.toThrow();
  });
});

describe('banner label keys stay inside the known i18n namespace', () => {
  // Guard against a resolver accidentally returning a typo'd key that would
  // surface as a raw "settings.providers.import.xxx" string in production.
  const KNOWN_KEYS = new Set([
    'settings.providers.import.geminiFound',
    'settings.providers.import.geminiNoKey',
    'settings.providers.import.geminiBlocked',
    'settings.providers.import.opencodeFound',
    'settings.providers.import.opencodeBlocked',
  ]);

  it('every gemini view references a known key or a caller-supplied warning', () => {
    const cases = [
      resolveGeminiBanner({ hasApiKey: true, blocked: false, warnings: [] }),
      resolveGeminiBanner({ hasApiKey: false, blocked: false, warnings: [] }),
      resolveGeminiBanner({ hasApiKey: false, blocked: true, warnings: [] }),
    ];
    for (const view of cases) {
      const key = view.kind === 'blocked' ? view.warning : view.labelKey;
      expect(KNOWN_KEYS.has(key)).toBe(true);
    }
  });

  it('every opencode view references a known key or a caller-supplied warning', () => {
    const cases = [
      resolveOpencodeBanner({ count: 3, providerLabels: ['A'], blocked: false, warnings: [] }),
      resolveOpencodeBanner({ count: 0, providerLabels: [], blocked: true, warnings: [] }),
    ];
    for (const view of cases) {
      const key = view.kind === 'blocked' ? view.warning : view.labelKey;
      expect(KNOWN_KEYS.has(key)).toBe(true);
    }
  });
});
