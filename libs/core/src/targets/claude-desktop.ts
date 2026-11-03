import type { CoreDeps } from '../context.js';
import type { AccountTarget } from './types.js';
import { electronTarget } from './electron-dir.js';

export const CLAUDE_DESKTOP_BINARY = '/usr/lib/claude-desktop/claude-desktop';
export const CLAUDE_DESKTOP_SHARED = ['claude_desktop_config.json'];
/**
 * Chrome starts this helper for the Claude-in-Chrome extension. It lives as long as Chrome and
 * keeps only `logs/chrome-native-host.log` open in the data dir, so it does not mean the app runs.
 */
export const CLAUDE_CHROME_NATIVE_HOST = '/usr/lib/claude-desktop/resources/chrome-native-host';

/** Claude desktop: swaps ~/.config/Claude; MCP servers in claude_desktop_config.json stay shared. */
export function claudeDesktopTarget(deps: CoreDeps): AccountTarget {
  return electronTarget(deps, {
    id: 'claude-desktop',
    liveDir: deps.paths.claudeDesktopDir,
    appBinary: deps.appBinaries?.['claude-desktop'] ?? CLAUDE_DESKTOP_BINARY,
    sharedFiles: CLAUDE_DESKTOP_SHARED,
    ignoreExes: [CLAUDE_CHROME_NATIVE_HOST],
    launch: { cmd: 'gtk-launch', args: ['com.anthropic.Claude'] },
  });
}
