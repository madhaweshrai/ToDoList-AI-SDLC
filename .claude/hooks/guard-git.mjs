#!/usr/bin/env node
// PreToolUse hook (Bash): blocks dangerous git operations and commits that contain secrets.
// Exit code 2 blocks the tool call and feeds stderr back to Claude.
import { execFileSync } from 'node:child_process';

const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

function block(reason) {
  process.stderr.write(`Blocked by guard-git hook: ${reason}\n`);
  process.exit(2);
}

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const command = JSON.parse(input || '{}').tool_input?.command ?? '';
  if (!/\bgit\b/.test(command)) return;

  if (/\bgit\s+push\b[^;&|]*(--force\b|\s-f\b|--force-with-lease\b)/.test(command)) {
    block('force push is not allowed.');
  }
  if (/\bgit\s+push\b[^;&|]*[\s:](refs\/heads\/)?(master|main)(?=$|[\s;&|])/.test(command)) {
    block('pushing to master/main is not allowed; push the feature branch and open a PR.');
  }
  if (/\bgit\s+commit\b/.test(command)) {
    let staged = '';
    try {
      staged = execFileSync('git', ['diff', '--cached', '-U0'], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    } catch {
      return;
    }
    const addedLines = staged.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
    const hit = addedLines.find((line) => SECRET_PATTERNS.some((pattern) => pattern.test(line)));
    if (hit) block('staged changes contain what looks like a secret. Remove it before committing.');
    if (/^\+\+\+ b\/node_modules\//m.test(staged)) block('node_modules/ is staged. Unstage it.');
  }
});
