#!/usr/bin/env node
/** Railway release command: apply migrations before traffic switches. */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const result = spawnSync(
  'npx',
  ['prisma', 'migrate', 'deploy', '--schema=prisma/schema.prisma'],
  { cwd: root, stdio: 'inherit', shell: true, env: process.env },
);
process.exit(result.status ?? 1);
