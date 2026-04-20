import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import * as TOML from '@iarna/toml';
import { CodesignError, type Config, parseConfigFlexible, toPersistedV3 } from '@open-codesign/shared';

const XDG_DEFAULT = join(homedir(), '.config', 'open-codesign');

export function configDir(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  if (xdg && xdg.length > 0) return join(xdg, 'open-codesign');
  return XDG_DEFAULT;
}

export function configPath(): string {
  return join(configDir(), 'config.toml');
}

export async function readConfig(): Promise<Config | null> {
  const path = configPath();
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if (isNotFound(err)) return null;
    throw new CodesignError(`Failed to read config at ${path}`, 'CONFIG_READ_FAILED', {
      cause: err,
    });
  }

  let parsed: unknown;
  try {
    parsed = TOML.parse(raw);
  } catch (err) {
    throw new CodesignError(`Config at ${path} is not valid TOML`, 'CONFIG_PARSE_FAILED', {
      cause: err,
    });
  }

  const validated = safeParseConfig(parsed);
  if (!validated.ok) {
    throw new CodesignError(
      `Config at ${path} does not match the expected schema: ${validated.error}`,
      'CONFIG_SCHEMA_INVALID',
      { cause: validated.cause },
    );
  }
  return validated.data;
}

function safeParseConfig(
  parsed: unknown,
):
  | { ok: true; data: Config }
  | { ok: false; error: string; cause: unknown } {
  try {
    return { ok: true, data: parseConfigFlexible(parsed) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      cause: err,
    };
  }
}

export async function writeConfig(config: Config): Promise<void> {
  const persisted = toPersistedV3(config);
  const dir = configDir();
  await mkdir(dir, { recursive: true });
  const path = configPath();
  const body = TOML.stringify(persisted as unknown as TOML.JsonMap);
  await writeFile(path, body, { encoding: 'utf8', mode: 0o600 });
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'ENOENT'
  );
}
