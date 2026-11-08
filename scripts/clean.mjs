import { readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// tsc overwrites matching outputs but never removes stale ones. Without this,
// deleted sources leave runnable ghosts in dist/ and public/ that are also
// invisible to git status because both directories are ignored.
const root = fileURLToPath(new URL('../', import.meta.url));
rmSync(`${root}dist`, { recursive: true, force: true });
for (const file of readdirSync(`${root}public`)) {
  if (/\.js(\.map)?$/.test(file)) rmSync(`${root}public/${file}`, { force: true });
}
