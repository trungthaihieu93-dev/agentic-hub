import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { writeFileAtomic } from './fs-safe.js';
import { NotInitializedError } from './errors.js';
import type { AhPaths } from './paths.js';

export const DEFAULT_PORT = 7427;
export const DEFAULT_HOST = '127.0.0.1';

export const ahConfigSchema = z.object({
  version: z.literal(1),
  port: z.number().int().min(1).max(65535),
  host: z.literal('127.0.0.1'),
  admin: z.object({
    algo: z.literal('scrypt'),
    salt: z.string(),
    hash: z.string(),
    N: z.number().int(),
    r: z.number().int(),
    p: z.number().int(),
  }),
  createdAt: z.string(),
});
export type AhConfig = z.infer<typeof ahConfigSchema>;

export function isInitialized(paths: AhPaths): boolean {
  return existsSync(paths.configFile);
}

export function readConfig(paths: AhPaths): AhConfig {
  if (!existsSync(paths.configFile)) throw new NotInitializedError(paths.ahDir);
  return ahConfigSchema.parse(JSON.parse(readFileSync(paths.configFile, 'utf8')));
}

export function writeConfig(paths: AhPaths, config: AhConfig): void {
  writeFileAtomic(paths.configFile, JSON.stringify(ahConfigSchema.parse(config), null, 2) + '\n', 0o600);
}
