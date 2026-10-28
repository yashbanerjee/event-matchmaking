#!/usr/bin/env node
/**
 * Start Next.js on Railway's PORT (defaults to 3000 locally).
 * Uses `next start` so CSS and static assets load correctly.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = String(process.env.PORT || '3000');
const host = process.env.HOSTNAME || '0.0.0.0';

process.env.PORT = port;
process.env.HOSTNAME = host;

console.log(`Starting web on http://${host}:${port}`);

const child = spawn(
  'npx',
  ['next', 'start', '-H', host, '-p', port],
  {
    cwd: resolve(root, 'apps/web'),
    stdio: 'inherit',
    shell: true,
    env: process.env,
  },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
