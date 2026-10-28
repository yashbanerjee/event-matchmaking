#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const webRoot = resolve(import.meta.dirname, '../apps/web');
const result = spawnSync('npx', ['next', 'build'], {
  cwd: webRoot,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
});

process.exit(result.status ?? 1);
