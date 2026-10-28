#!/usr/bin/env node
/**
 * Start Next.js on Railway's PORT (defaults to 3000 locally).
 * Railway public networking must target the same port (often 8080).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = String(process.env.PORT || '3000');
const host = process.env.HOSTNAME || '0.0.0.0';

process.env.PORT = port;
process.env.HOSTNAME = host;

console.log(`Starting web on http://${host}:${port}`);

const standaloneCandidates = [
  resolve(root, 'apps/web/server.js'),
  resolve(root, 'apps/web/.next/standalone/apps/web/server.js'),
  resolve(root, 'apps/web/.next/standalone/server.js'),
];

const standalone = standaloneCandidates.find((p) => existsSync(p));
if (standalone) {
  const child = spawn(process.execPath, [standalone], {
    cwd: resolve(standalone, '..'),
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
} else {
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
}
