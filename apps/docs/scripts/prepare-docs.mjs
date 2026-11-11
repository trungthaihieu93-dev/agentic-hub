import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = fileURLToPath(new URL('../src/content/docs/', import.meta.url));
const repository = 'https://github.com/trungthaihieu93-dev/agentic-hub';
const documents = [
  ['usage.md', 'Using ah'],
  ['design-guidelines.md', 'Design guidelines'],
];

await mkdir(output, { recursive: true });
for (const [file, title] of documents) {
  let content = await readFile(path.join(root, 'docs', file), 'utf8');
  const links = [...content.matchAll(/\]\((\.\.\/[^)#?]+)(#[^)]*)?\)/g)];
  for (const match of links) {
    const [, target, fragment = ''] = match;
    const relative = path.posix.normalize(path.posix.join('docs', target));
    const kind = (await stat(path.join(root, relative))).isDirectory() ? 'tree' : 'blob';
    content = content.replace(match[0], `](${repository}/${kind}/main/${relative}${fragment})`);
  }
  content = content.replace(/^# .+\n/, '');
  await writeFile(path.join(output, file), `---\ntitle: ${title}\n---\n${content}`);
}
