#!/usr/bin/env node
/**
 * Vendor the agent service into a Lambda deployment bundle.
 *
 * CDK uploads `backend/.lambda-bundle/` as the function's code asset, so the
 * Python dependencies have to be sitting in it before `ampx` synthesises.
 * That is why this runs in the build phase of amplify.yml rather than from a
 * CDK bundling hook — Amplify's build container has Python but not Docker.
 *
 * Wheels are fetched for the Lambda runtime's platform explicitly, so the
 * bundle is correct even when built on macOS or Windows.
 *
 *   node scripts/build-agent-bundle.mjs
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend');
const BUNDLE = join(BACKEND, '.lambda-bundle');

// Must match the runtime in amplify/agents/resource.ts.
const PYTHON_VERSION = '3.12';
const PLATFORM = 'manylinux2014_x86_64';

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit', cwd: ROOT });
}

/** The build container may expose Python as `python3` or `python`. */
function findPython() {
  for (const candidate of ['python3', 'python']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    'No Python interpreter found. The agent Lambda bundle needs Python to vendor its dependencies.'
  );
}

console.log('[agent-bundle] building Lambda package…');

rmSync(BUNDLE, { recursive: true, force: true });
mkdirSync(BUNDLE, { recursive: true });

const python = findPython();

// --only-binary=:all: makes a missing wheel a hard failure rather than a
// source build that would silently produce a package Lambda cannot import.
run(python, [
  '-m',
  'pip',
  'install',
  '--quiet',
  '--requirement',
  join(BACKEND, 'requirements-lambda.txt'),
  '--target',
  BUNDLE,
  '--platform',
  PLATFORM,
  '--implementation',
  'cp',
  '--python-version',
  PYTHON_VERSION,
  '--only-binary=:all:',
  '--upgrade',
]);

cpSync(join(BACKEND, 'app'), join(BUNDLE, 'app'), {
  recursive: true,
  filter: (src) => !src.includes('__pycache__'),
});
cpSync(join(BACKEND, 'lambda_handler.py'), join(BUNDLE, 'lambda_handler.py'));

if (!existsSync(join(BUNDLE, 'app', 'main.py'))) {
  throw new Error('[agent-bundle] bundle is missing app/main.py — build aborted.');
}
if (!existsSync(join(BUNDLE, 'fastapi'))) {
  throw new Error('[agent-bundle] dependencies were not vendored — build aborted.');
}

console.log(`[agent-bundle] ready at ${BUNDLE}`);
