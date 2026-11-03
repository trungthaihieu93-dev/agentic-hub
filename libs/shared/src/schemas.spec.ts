import { captureRequestSchema, labelSchema, switchRequestSchema, TARGET_IDS, TARGET_INFO } from './index.js';

describe('shared schemas', () => {
  it('accepts safe labels and rejects path-like ones', () => {
    expect(labelSchema.safeParse('Work 2.0').success).toBe(true);
    for (const bad of ['a/b', '.x', '', '   ', 'x'.repeat(41)]) expect(labelSchema.safeParse(bad).success).toBe(false);
  });

  it('validates capture and switch requests', () => {
    expect(captureRequestSchema.safeParse({ target: 'claude-cli', label: 'w' }).success).toBe(true);
    expect(captureRequestSchema.safeParse({ target: 'gemini', label: 'w' }).success).toBe(false);
    expect(switchRequestSchema.safeParse({ target: 'codex-cli', accountId: 'not-a-uuid' }).success).toBe(false);
    expect(switchRequestSchema.safeParse({ target: 'codex-cli', accountId: '0b6c3c3e-1f7a-4c1e-9d55-2f8a0b0f6a11', force: true }).success).toBe(true);
  });

  it('describes every target', () => {
    for (const id of TARGET_IDS) expect(TARGET_INFO[id].id).toBe(id);
  });
});
