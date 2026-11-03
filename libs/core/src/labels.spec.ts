import { parseLabel } from './labels.js';

describe('labels', () => {
  it('accepts normal labels', () => {
    expect(parseLabel('work')).toBe('work');
    expect(parseLabel('Team A-1.x')).toBe('Team A-1.x');
  });
  it.each(['a/b', '.hidden', '', ' ', 'x'.repeat(41), '../up', 'a\\b'])('rejects %j', (l) => {
    expect(() => parseLabel(l)).toThrow();
  });
});
