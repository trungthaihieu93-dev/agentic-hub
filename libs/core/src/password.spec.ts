import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const h = await hashPassword('correct horse');
    expect(h.algo).toBe('scrypt');
    expect(JSON.stringify(h)).not.toContain('correct horse');
    expect(await verifyPassword('correct horse', h)).toBe(true);
    expect(await verifyPassword('correct hors', h)).toBe(false);
  });

  it('rejects passwords shorter than 8 characters', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/at least 8/);
  });
});
