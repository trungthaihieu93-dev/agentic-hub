// Copies the built web UI next to the `ah` bundle and makes the bundle executable.
// Runs from the workspace root as the last step of `nx build cli`.
import { chmodSync, cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (rel) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const webOut = root('apps/web/dist');
const cliOut = root('apps/cli/dist');
const publicDir = `${cliOut}/public`;
const bin = `${cliOut}/main.js`;

if (!existsSync(`${webOut}/index.html`)) {
  console.error(`post-build: ${webOut}/index.html is missing; build the web app first`);
  process.exit(1);
}
if (!existsSync(bin)) {
  console.error(`post-build: ${bin} is missing; the esbuild step did not run`);
  process.exit(1);
}

rmSync(publicDir, { recursive: true, force: true });
cpSync(webOut, publicDir, { recursive: true });
chmodSync(bin, 0o755);
console.log(`post-build: copied the web UI to ${publicDir} and made ${bin} executable`);
