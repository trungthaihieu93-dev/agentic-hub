import os from 'node:os';
import { resolvePaths } from './paths.js';

describe('paths', () => {
  it('derives every path from the home directory', () => {
    const p = resolvePaths('/tmp/h');
    expect(p.ahDir).toBe('/tmp/h/.ah');
    expect(p.claudeCredentials).toBe('/tmp/h/.claude/.credentials.json');
    expect(p.codexDaemonPid).toBe('/tmp/h/.codex/app-server-daemon/daemon.pid');
    expect(p.claudeDesktopDir).toBe('/tmp/h/.config/Claude');
  });
  it('refuses the real home inside tests', () => {
    expect(() => resolvePaths(os.homedir())).toThrow(/real home/);
  });
});
