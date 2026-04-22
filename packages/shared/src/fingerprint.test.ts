import { describe, expect, it } from 'vitest';
import { computeFingerprint, normalizeFrame } from './fingerprint';

describe('computeFingerprint', () => {
  it('returns 8 hex chars', () => {
    const fp = computeFingerprint({ errorCode: 'PROVIDER_ERROR', stack: undefined });
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
  });

  it('different error codes produce different fingerprints', () => {
    const a = computeFingerprint({ errorCode: 'A', stack: undefined });
    const b = computeFingerprint({ errorCode: 'B', stack: undefined });
    expect(a).not.toBe(b);
  });

  it('same code + same top-3 frames produce the same fingerprint', () => {
    const stackA = [
      'Error: whatever',
      '    at generate (/Users/alice/proj/packages/core/src/index.ts:482:11)',
      '    at handler (/Users/alice/proj/apps/desktop/src/main/index.ts:430:5)',
      '    at processTicks (/Users/alice/proj/node_modules/.pnpm/foo/bar.js:99:99)',
    ].join('\n');
    const stackB = [
      'Error: different message',
      '    at generate (/Users/bob/work/packages/core/src/index.ts:482:19)', // different line
      '    at handler (/Users/bob/work/apps/desktop/src/main/index.ts:431:5)', // different user + line
      '    at processTicks (/Users/bob/work/node_modules/.pnpm/foo/bar.js:100:100)',
    ].join('\n');
    expect(computeFingerprint({ errorCode: 'X', stack: stackA })).toBe(
      computeFingerprint({ errorCode: 'X', stack: stackB }),
    );
  });

  it('different code-location top frames produce different fingerprints', () => {
    const stackA = [
      'Error',
      '    at generate (/pkg/src/index.ts:1:1)',
      '    at handler (/pkg/src/main.ts:2:2)',
    ].join('\n');
    const stackB = [
      'Error',
      '    at applyComment (/pkg/src/index.ts:1:1)', // different function name
      '    at handler (/pkg/src/main.ts:2:2)',
    ].join('\n');
    expect(computeFingerprint({ errorCode: 'X', stack: stackA })).not.toBe(
      computeFingerprint({ errorCode: 'X', stack: stackB }),
    );
  });

  it('ignores <anonymous> and internal/ frames', () => {
    const noisy = [
      'Error',
      '    at <anonymous> (/pkg/foo.ts:1:1)',
      '    at processTicksAndRejections (node:internal/process/task_queues:105:5)',
      '    at generate (/pkg/src/index.ts:482:11)',
      '    at handler (/pkg/src/main.ts:430:5)',
      '    at bootstrap (/pkg/src/boot.ts:10:10)',
    ].join('\n');
    const clean = [
      'Error',
      '    at generate (/pkg/src/index.ts:482:11)',
      '    at handler (/pkg/src/main.ts:430:5)',
      '    at bootstrap (/pkg/src/boot.ts:10:10)',
    ].join('\n');
    expect(computeFingerprint({ errorCode: 'X', stack: noisy })).toBe(
      computeFingerprint({ errorCode: 'X', stack: clean }),
    );
  });

  it('handles missing stack gracefully', () => {
    expect(() => computeFingerprint({ errorCode: 'X', stack: undefined })).not.toThrow();
    expect(() => computeFingerprint({ errorCode: 'X', stack: '' })).not.toThrow();
  });
});

describe('normalizeFrame', () => {
  it('strips absolute path and line/col from a qualified frame', () => {
    expect(normalizeFrame('at generate (/Users/x/proj/src/index.ts:482:11)')).toBe(
      'at generate (index.ts)',
    );
  });

  it('strips paths from paren-less frames like `at /Users/foo/bar.js`', () => {
    expect(normalizeFrame('at /Users/x/proj/src/foo.js:1:1')).toBe('at foo.js');
  });

  it('strips paths from paren-less Windows frames', () => {
    expect(normalizeFrame('at C:\\Users\\x\\proj\\foo.js:1:1')).toBe('at foo.js');
  });

  it('strips paths from paren-less ~/ frames', () => {
    expect(normalizeFrame('at ~/proj/src/foo.js:1:1')).toBe('at foo.js');
  });
});
