import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Compiled modules live in dist/src/ and dist/scripts/. Two levels up is the
// project root, which is where public/, assets/ and capture/ remain.
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
