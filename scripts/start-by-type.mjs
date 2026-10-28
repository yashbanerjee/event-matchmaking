#!/usr/bin/env node
/**
 * Start only the app selected by SERVICE_TYPE (api | web | worker).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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

console.log(`Starting SERVICE_TYPE=${type} (folder: apps/${type})`);

function runNode(scriptPath, args = []) {
  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

function runNpm(args) {
  const child = spawn('npm', args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

if (type === 'api') {
  if (process.env.SKIP_DB_MIGRATE !== 'true') {
    console.log('Running prisma migrate deploy…');
    const migrate = spawnSync(
      'npx',
      ['prisma', 'migrate', 'deploy', '--schema=prisma/schema.prisma'],
      { cwd: root, stdio: 'inherit', shell: true, env: process.env },
    );
    if (migrate.status !== 0) process.exit(migrate.status ?? 1);
  }
  const mainJs = resolve(root, 'apps/api/dist/main.js');
  if (!existsSync(mainJs)) {
    console.error(`Missing ${mainJs} — build api first`);
    process.exit(1);
  }
  runNode(mainJs);
} else if (type === 'worker') {
  const mainJs = resolve(root, 'apps/worker/dist/main.js');
  if (!existsSync(mainJs)) {
    console.error(`Missing ${mainJs} — build worker first`);
    process.exit(1);
  }
  runNode(mainJs);
} else {
  // web — prefer Next standalone server if present
  const standalone = resolve(root, 'apps/web/server.js');
  const nestedStandalone = resolve(root, 'apps/web/.next/standalone/apps/web/server.js');
  if (existsSync(standalone)) {
    runNode(standalone);
  } else if (existsSync(nestedStandalone)) {
    runNode(nestedStandalone);
  } else {
    const port = process.env.PORT || '3000';
    runNpm([
      'run',
      'start',
      '-w',
      '@em/web',
      '--',
      '-H',
      '0.0.0.0',
      '-p',
      String(port),
    ]);
  }
}
