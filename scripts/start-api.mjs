#!/usr/bin/env node
/**
 * Production API entry: run migrations (optional) then start Nest.
 * Set SKIP_DB_MIGRATE=true to skip migrate (e.g. when using Railway releaseCommand).
 */
import { spawnSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const mainJs = resolve(root, 'apps/api/dist/main.js');

if (!existsSync(mainJs)) {
  console.error(`API build missing: ${mainJs}`);
  process.exit(1);
}

if (process.env.SKIP_DB_MIGRATE !== 'true') {
  console.log('Running prisma migrate deploy…');
  const migrate = spawnSync(
    'npx',
    ['prisma', 'migrate', 'deploy', '--schema=prisma/schema.prisma'],
    { cwd: root, stdio: 'inherit', shell: true, env: process.env },
  );
  if (migrate.status !== 0) {
    process.exit(migrate.status ?? 1);
  }
}

const child = spawn(process.execPath, [mainJs], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
