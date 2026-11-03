import path from 'node:path';
import { assertNotRealHome } from './testing/temp-home.js';

export interface AhPaths {
  homeDir: string;
  ahDir: string;
  configFile: string;
  dbFile: string;
  profilesDir: string;
  sharedDir: string;
  backupsDir: string;
  tmpDir: string;
  lockFile: string;
  journalFile: string;
  pidFile: string;
  claudeCredentials: string;
  claudeJson: string;
  claudeVersionsDir: string;
  codexDir: string;
  codexAuth: string;
  codexAuthLock: string;
  codexDaemonPid: string;
  configDir: string;
  claudeDesktopDir: string;
  codexDesktopDir: string;
}

/** Every path ah touches, derived from one home directory so tests can use a temp home. */
export function resolvePaths(homeDir: string): AhPaths {
  assertNotRealHome(homeDir);
  const home = path.resolve(homeDir);
  const ahDir = path.join(home, '.ah');
  const configDir = path.join(home, '.config');
  const codexDir = path.join(home, '.codex');
  return {
    homeDir: home,
    ahDir,
    configFile: path.join(ahDir, 'config.json'),
    dbFile: path.join(ahDir, 'ah.db'),
    profilesDir: path.join(ahDir, 'profiles'),
    sharedDir: path.join(ahDir, 'shared'),
    backupsDir: path.join(ahDir, 'backups'),
    tmpDir: path.join(ahDir, 'tmp'),
    lockFile: path.join(ahDir, 'switch.lock'),
    journalFile: path.join(ahDir, 'switch-journal.json'),
    pidFile: path.join(ahDir, 'server.pid'),
    claudeCredentials: path.join(home, '.claude', '.credentials.json'),
    claudeJson: path.join(home, '.claude.json'),
    claudeVersionsDir: path.join(home, '.local', 'share', 'claude', 'versions'),
    codexDir,
    codexAuth: path.join(codexDir, 'auth.json'),
    codexAuthLock: path.join(codexDir, 'auth.lock'),
    codexDaemonPid: path.join(codexDir, 'app-server-daemon', 'daemon.pid'),
    configDir,
    claudeDesktopDir: path.join(configDir, 'Claude'),
    codexDesktopDir: path.join(configDir, 'Codex'),
  };
}
