// Development entry: serves the built web UI from apps/web with the same server the `ah` bin uses.
// The bundle lives in apps/server/dist, so the UI is two levels up.
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startServer } from '@agentic-hub/server-lib';

const publicDir = fileURLToPath(new URL('../../web/dist', import.meta.url));
const server = await startServer({ homeDir: os.homedir(), publicDir });
console.log(`ah dev server on ${server.url}`);
const stop = () => void server.close().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
