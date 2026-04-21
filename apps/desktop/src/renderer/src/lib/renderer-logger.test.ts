/**
 * Unit tests for renderer-logger.ts
 *
 * The bridge is stateful (singleton `bridgeInstalled` flag) so each test
 * runs against a fresh module import via `vi.resetModules()`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We need to mock window.codesign BEFORE importing the module under test.
// Each test re-imports the module so the singleton guard resets.

describe('installRendererLogBridge', () => {
  let logSpy: ReturnType<typeof vi.fn>;
  let origWarn: typeof console.warn;
  let origError: typeof console.error;

  beforeEach(() => {
    origWarn = console.warn;
    origError = console.error;
    logSpy = vi.fn().mockResolvedValue(undefined);

    // Provide a minimal window.codesign stub.
    Object.defineProperty(globalThis, 'window', {
      value: {
        ...((globalThis as typeof globalThis & { window?: unknown }).window ?? {}),
        codesign: {
          diagnostics: {
            log: logSpy,
          },
        },
        addEventListener: vi.fn(),
      },
      writable: true,
    });
  });

  afterEach(() => {
    // Restore console before resetModules so the next test starts with a clean
    // prototype — otherwise patches stack across re-imports and one console call
    // triggers every previously installed forwarder (all of which now point at
    // the fresh logSpy because they read window.codesign at call time).
    console.warn = origWarn;
    console.error = origError;
    vi.resetModules();
  });

  it('forwards console.error to window.codesign.diagnostics.log', async () => {
    const { installRendererLogBridge } = await import('./renderer-logger');
    installRendererLogBridge();

    console.error('something went wrong');

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        level: 'error',
        scope: 'console',
        message: expect.stringContaining('something went wrong'),
      }),
    );
  });

  it('forwards console.warn to window.codesign.diagnostics.log', async () => {
    const { installRendererLogBridge } = await import('./renderer-logger');
    installRendererLogBridge();

    console.warn('a warning occurred');

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        level: 'warn',
        scope: 'console',
        message: expect.stringContaining('a warning occurred'),
      }),
    );
  });

  it('is idempotent — calling twice does not double-patch', async () => {
    const { installRendererLogBridge } = await import('./renderer-logger');
    installRendererLogBridge();
    installRendererLogBridge();

    console.error('once');

    // Should be called exactly once, not twice.
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('rendererLogger.error forwards to window.codesign.diagnostics.log', async () => {
    const { installRendererLogBridge, rendererLogger } = await import('./renderer-logger');
    installRendererLogBridge();

    rendererLogger.error('my-scope', 'explicit error', { key: 'value' });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        level: 'error',
        scope: 'my-scope',
        message: 'explicit error',
        data: { key: 'value' },
      }),
    );
  });

  it('does not throw when window.codesign is unavailable', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: { codesign: undefined, addEventListener: vi.fn() },
      writable: true,
    });

    const { installRendererLogBridge } = await import('./renderer-logger');
    // Should not throw even without bridge available.
    expect(() => installRendererLogBridge()).not.toThrow();
    expect(() => console.error('no bridge')).not.toThrow();
  });

  it('preserves object structure in console.error args', async () => {
    const { installRendererLogBridge } = await import('./renderer-logger');
    installRendererLogBridge();

    console.error('[store]', { detail: { id: 42 }, op: 'update' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const entry = logSpy.mock.calls[0]?.[0] as { message: string } | undefined;
    expect(entry?.message).not.toContain('[object Object]');
    expect(entry?.message).toContain('"id":42');
    expect(entry?.message).toContain('"op":"update"');
  });

  it('handles Error instances without throwing', async () => {
    const { installRendererLogBridge } = await import('./renderer-logger');
    installRendererLogBridge();

    console.error('failed:', new Error('boom'));

    const entry = logSpy.mock.calls[0]?.[0] as { message: string } | undefined;
    expect(entry?.message).toContain('boom');
  });

  it('handles circular objects without throwing', async () => {
    const { installRendererLogBridge } = await import('./renderer-logger');
    installRendererLogBridge();

    const a: Record<string, unknown> = { name: 'a' };
    a['self'] = a;

    expect(() => {
      console.error('circ', a);
    }).not.toThrow();
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
