import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { ValidationError } from './errors.js';

export interface PasswordHash {
  algo: 'scrypt';
  salt: string;
  hash: string;
  N: number;
  r: number;
  p: number;
}

export const MIN_PASSWORD_LENGTH = 8;
const KEY_LEN = 64;
const DEFAULT = { N: 2 ** 15, r: 8, p: 1 };

function derive(password: string, salt: Buffer, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  const options: ScryptOptions = { N: opts.N, r: opts.r, p: opts.p, maxmem: 256 * opts.N * opts.r };
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LEN, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`The password must have at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const salt = randomBytes(16);
  const key = await derive(password, salt, DEFAULT);
  return { algo: 'scrypt', salt: salt.toString('base64'), hash: key.toString('base64'), ...DEFAULT };
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const expected = Buffer.from(stored.hash, 'base64');
  const key = await derive(password, Buffer.from(stored.salt, 'base64'), stored);
  return key.length === expected.length && timingSafeEqual(key, expected);
}
