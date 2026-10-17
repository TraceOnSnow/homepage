// Manual smoke test of the F5 production commands, using a consistent private data copy.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { occupied } from '../scripts/dev-service.mjs';

process.umask(0o077);
const root = process.cwd();
const backend = path.join(root, 'services/payload');
const source = path.join(backend, 'storage/payload.db');
if ((await occupied(3000)) || (await occupied(4321))) throw Error('Stop local preview services before testing.');
await mkdir('.cache/production-preview-tests', { recursive: true, mode: 0o700 });
const directory = await mkdtemp(path.join(root, '.cache/production-preview-tests/run-'));
const database = path.join(directory, 'payload.db');
const hash = async () =>
  createHash('sha256')
    .update(await readFile(source))
    .digest('hex');
const before = await hash();
const original = new DatabaseSync(source, { readOnly: true });
try {
  await backup(original, database);
} finally {
  original.close();
}
const env = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: `file:${database}`,
  MEDIA_DIR: path.join(directory, 'media'),
  PAYLOAD_SECRET: 'isolated-production-preview-browser-secret',
  SERVER_URL: 'http://localhost:3000',
};
const children = [];
function start(args, options = {}) {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  children.push(child);
  let output = '';
  child.stdout.on('data', (chunk) => {
    output = (output + chunk).slice(-12000);
  });
  child.stderr.on('data', (chunk) => {
    output = (output + chunk).slice(-12000);
  });
  child.output = () => output;
  child.finished = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code));
  });
  return child;
}
async function ready(child, url) {
  for (let i = 0; i < 100; i++) {
    assert.equal(child.exitCode, null, child.output());
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      /* startup */
    }
    await sleep(100);
  }
  throw Error(child.output());
}
async function memory(name) {
  const folder = (await readFile(`.cache/dev-logs/latest-${name}.txt`, 'utf8')).trim();
  const samples = (await readFile(path.join(folder, 'memory.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  return {
    peakMiB: Math.round(Math.max(...samples.map((s) => s.service.rssKiB)) / 1024),
    lastMiB: Math.round(samples.at(-1).service.rssKiB / 1024),
    minAvailableMiB: Math.round(Math.min(...samples.map((s) => s.system.memAvailableKiB)) / 1024),
    logDirectory: folder,
  };
}
let browser;
let report;
try {
  // Create a fixture login only in the disposable copy, never reset the real administrator.
  const seed = start(
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
    import { getPayload } from 'payload';
    import config from './src/payload.config.ts';
    const payload = await getPayload({config});
    await payload.create({collection:'users',data:{email:'production-preview@example.test',password:'isolated-preview-password-123'}});
    await payload.destroy();
  `,
    ],
    { cwd: backend },
  );
  assert.equal(await seed.finished, 0, seed.output());
  console.log('Disposable copy ready; starting the production commands.');
  const api = start(['scripts/dev-service.mjs', 'payload']);
  await ready(api, 'http://localhost:3000/api/works?limit=1');
  if (!process.argv.includes('--skip-refresh')) {
    console.log('Checking the explicit static refresh command.');
    const refresh = start(['scripts/prepare-preview.mjs', '--refresh']);
    assert.equal(await refresh.finished, 0, refresh.output());
  }
  const site = start(['scripts/dev-service.mjs', 'site']);
  await ready(site, 'http://localhost:4321/');
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://localhost:3000/admin/login');
  await page.locator('#field-email').fill('production-preview@example.test');
  await page.locator('#field-password').fill('isolated-preview-password-123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL('http://localhost:3000/admin');
  console.log('Logged in; checking Works list and edit pages three times.');
  for (let i = 0; i < 3; i++) {
    await page.locator('a.card__click[href="/admin/collections/works"]').click();
    await expect(page).toHaveURL(/\/admin\/collections\/works/);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await page.locator('tbody tr').first().getByRole('link').first().click();
    await expect(page.locator('#field-title')).toBeVisible();
    await page.goto('http://localhost:3000/admin');
  }
  await page.goto('http://localhost:3000/admin/collections/posts');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  console.log('Works and Posts usable; checking the static visitor pages.');
  const front = await browser.newPage();
  const apiRequests = [];
  const failedAssets = [];
  front.on('response', (response) => {
    if (new URL(response.url()).origin === 'http://localhost:4321' && response.status() >= 400) {
      failedAssets.push(response.url());
    }
  });
  front.on('pageerror', (error) => errors.push(error.message));
  front.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  for (const route of ['/', '/library', '/library/?type=game', '/post/markdown-notes']) {
    const response = await front.goto(`http://localhost:4321${route}`);
    assert.equal(response.status(), 200, route);
  }
  for (const route of ['/this-page-does-not-exist', '/.env', '/services/payload/.env']) {
    assert.equal((await fetch(`http://localhost:4321${route}`)).status, 404);
  }
  await sleep(6000);
  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, []);
  assert.deepEqual(failedAssets, []);
  report = { passed: true, payload: await memory('payload'), site: await memory('site'), sourceUnchanged: true };
  await writeFile(path.join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
} finally {
  if (browser) await browser.close();
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  for (const child of children) {
    await Promise.race([child.finished, sleep(5000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  assert.equal(await hash(), before, 'Original SQLite must remain unchanged');
  // Keep the report; remove the database and any generated fixture credentials/data.
  for (const name of ['payload.db', 'payload.db-shm', 'payload.db-wal', 'media']) {
    await rm(path.join(directory, name), { recursive: true, force: true });
  }
}
console.log(JSON.stringify(report, null, 2));
