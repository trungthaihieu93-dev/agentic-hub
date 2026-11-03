// The `ah` command. Keep this file thin: everything testable lives in run.ts and commands/.
import { realpathSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { promptPassword } from './prompt-password.js';
import { run } from './run.js';

process.umask(0o077);

// Record the script path exactly as it appears in this process's cmdline (often the
// ~/.bun/bin/ah symlink), so the single-instance check can recognise this server later.
const entry = process.argv[1] ?? realpathSync(fileURLToPath(import.meta.url));
const result = await run(process.argv.slice(2), {
  homeDir: os.homedir(),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  entry,
  out: (line) => process.stdout.write(line + '\n'),
  err: (line) => process.stderr.write(line + '\n'),
  prompt: (q) => promptPassword(q),
}).catch((err: unknown) => {
  process.stderr.write(`ah: ${err instanceof Error ? err.message : String(err)}\n`);
  return { code: 1, server: undefined };
});

if (result.server) {
  const server = result.server;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void server.stop().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} else {
  process.exitCode = process.exitCode || result.code;
}
