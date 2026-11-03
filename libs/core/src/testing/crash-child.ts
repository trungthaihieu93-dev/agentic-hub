// Child process used by crash tests: runs a switch in the given temp home and SIGKILLs itself
// right after the journal (or the desktop rename) reaches the requested step.
import type { TargetId } from '@agentic-hub/shared';
import { switchAccount } from '../switch-engine.js';
import { openAhDb } from '../init.js';
import { resolvePaths } from '../paths.js';

const [homeDir, accountId, crashStep, crashPoint, target = 'codex-cli'] = process.argv.slice(2);
const paths = resolvePaths(homeDir);
const db = openAhDb(paths);
await switchAccount(
  {
    paths,
    db,
    listProcesses: () => [],
    run: async () => ({ code: 0, stdout: 'Logged in using ChatGPT', stderr: '' }),
    hooks: {
      afterJournal: (step) => {
        if (crashPoint === 'journal' && step === crashStep) process.kill(process.pid, 'SIGKILL');
      },
      beforeCommit: () => {
        if (crashPoint === 'commit') process.kill(process.pid, 'SIGKILL');
      },
    },
  },
  { target: target as TargetId, accountId, actor: 'cli' },
);
process.exit(0);
