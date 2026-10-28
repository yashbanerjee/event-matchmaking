#!/usr/bin/env node
/**
 * Build only the app selected by SERVICE_TYPE (api | web | worker).
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const type = (process.env.SERVICE_TYPE || process.argv[2] || '')
  .trim()
  .toLowerCase();

if (!['api', 'web', 'worker'].includes(type)) {
  console.error(
    `SERVICE_TYPE must be api | web | worker (got "${type || '(empty)'}")`,
  );
  process.exit(1);
}

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Building SERVICE_TYPE=${type} (folder: apps/${type})`);

if (type === 'api' || type === 'worker') {
  run('npx', ['prisma', 'generate', '--schema=prisma/schema.prisma']);
  run('npm', ['run', 'build', '-w', '@em/shared']);
  run('npm', ['run', 'build', '-w', '@em/domain']);
  run('npm', ['run', 'build', '-w', `@em/${type}`]);
} else {
  // web
  process.env.NODE_ENV = 'production';
  run('npm', ['run', 'build', '-w', '@em/shared']);
  run('npm', ['run', 'build', '-w', '@em/web']);
}

console.log(`Build complete for apps/${type}`);
