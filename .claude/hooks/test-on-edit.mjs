#!/usr/bin/env node
// PostToolUse hook (Edit|Write): after a change to app code or tests, runs the related Jest tests.
// On failure exits 2 so the failing output is fed back to Claude to fix immediately.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const WATCHED_DIRS = ['JS', 'backend', 'db', 'tests'];
const WATCHED_FILES = ['index.html'];

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const filePath = JSON.parse(input || '{}').tool_input?.file_path ?? '';
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const relative = path.relative(projectDir, path.resolve(filePath)).split(path.sep).join('/');
  const watched = WATCHED_FILES.includes(relative) || WATCHED_DIRS.some((dir) => relative.startsWith(`${dir}/`));
  if (!filePath || !watched) return;

  const jest = path.join(projectDir, 'node_modules', 'jest', 'bin', 'jest.js');
  if (!existsSync(jest)) return; // dependencies not installed; nothing to run

  // JS files: only the tests that import them. Anything else (SQL, HTML): the whole suite.
  const args = relative.endsWith('.js') ? ['--findRelatedTests', relative, '--passWithNoTests'] : [];
  const result = spawnSync(process.execPath, [jest, '--silent', ...args], { cwd: projectDir, encoding: 'utf8' });
  if (result.status !== 0) {
    const tail = `${result.stdout}\n${result.stderr}`.split('\n').slice(-60).join('\n');
    process.stderr.write(`Jest failed after editing ${relative}:\n${tail}\n`);
    process.exit(2);
  }
});
