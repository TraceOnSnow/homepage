// Manual live-provider test: production build, real metadata APIs, disposable local SQLite.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { occupied } from '../scripts/dev-service.mjs';

process.umask(0o077);
const root = process.cwd();
const backend = path.join(root, 'services/payload');
const source = path.join(backend, 'storage/payload.db');
const hash = async () =>
  createHash('sha256')
    .update(await readFile(source))
    .digest('hex');
if (await occupied(3000)) throw Error('Stop the local Payload before running this test.');
await readFile(path.join(backend, '.next/BUILD_ID'));
await mkdir('.cache/metadata-live', { recursive: true, mode: 0o700 });
const directory = await mkdtemp(path.join(root, '.cache/metadata-live/run-'));
const before = await hash();
const env = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: `file:${directory}/payload.db`,
  MEDIA_DIR: path.join(directory, 'media'),
  PAYLOAD_SECRET: 'disposable-live-metadata-browser-secret',
  SERVER_URL: 'http://localhost:3000',
  NEXT_TELEMETRY_DISABLED: '1',
};
const children = [];
function start(args, cwd = backend) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let output = '';
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      output += chunk;
    });
  child.output = () => output;
  child.finished = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code));
  });
  return child;
}
let browser;
let report;
try {
  const seed = start([
    '--import',
    'tsx',
    '--input-type=module',
    '-e',
    `
    import {getPayload} from 'payload';
    import config from './src/payload.config.ts';
    const payload=await getPayload({config});
    await payload.db.migrate();
    await payload.create({collection:'users',data:{email:'metadata-browser@example.test',password:'disposable-browser-password-123'}});
    await payload.destroy();
  `,
  ]);
  assert.equal(await seed.finished, 0, seed.output().slice(-3000));
  const api = start(['scripts/dev-service.mjs', 'payload'], root);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert.equal(api.exitCode, null, api.output().slice(-3000));
    try {
      const response = await fetch('http://localhost:3000/api/works?limit=1', { signal: AbortSignal.timeout(1000) });
      await response.body?.cancel();
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* startup */
    }
    await sleep(100);
  }
  assert.ok(ready, 'Production API must be ready');
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://localhost:3000/admin/login');
  await page.locator('#field-email').fill('metadata-browser@example.test');
  await page.locator('#field-password').fill('disposable-browser-password-123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL('http://localhost:3000/admin');
  await page.goto('http://localhost:3000/admin/works-table');
  await expect(page.getByRole('status').filter({ hasText: '已读取' })).toBeVisible();
  const results = [];
  for (const [type, query, provider] of [
    ['anime', 'MyGO', 'bangumi'],
    ['boardgame', 'Catan', 'bgg'],
  ]) {
    console.log(`Testing ${provider}: real search, details and private save.`);
    await page.getByRole('button', { name: '＋记录作品', exact: true }).click();
    await page.getByLabel('新增作品类型').selectOption(type);
    await page.getByLabel('搜索外部作品').fill(query);
    const searched = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/metadata/search');
    await page.getByRole('button', { name: '搜索作品', exact: true }).click();
    const search = await (await searched).json();
    assert.equal(search.providers.find((p) => p.provider === provider)?.state, 'ok', `${provider} search unavailable`);
    const candidate = search.candidates.find((c) => c.provider === provider);
    assert.ok(candidate, `${provider} must return candidates`);
    const detailed = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/metadata/details');
    const saved = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/works' && r.request().method() === 'POST');
    // Attach both waiters before clicking; avoid an unhandled timeout if details fail.
    const responses = Promise.all([detailed, saved]);
    await page.getByRole('button', { name: `添加 ${candidate.title}`, exact: true }).click();
    const [detailResponse, saveResponse] = await responses;
    const detail = await detailResponse.json();
    assert.equal(detail.state, 'ok', `${provider} detail unavailable`);
    assert.equal(saveResponse.status(), 201);
    const work = (await saveResponse.json()).doc;
    assert.equal(work.visibility, 'private');
    assert.equal(work.status, 'completed');
    assert.ok(work.coverUrl, 'Details must fill the cover');
    assert.ok(work.description, 'Details must fill the description');
    assert.ok(work.sources.some((s) => s.provider === provider && s.externalId === candidate.externalId));
    await expect(page.locator(`tr[data-work-id="${work.id}"]`)).toBeVisible();
    results.push({ provider, search: 'ok', candidates: search.candidates.length, details: detail.state, savedPrivate: true });
    await page.screenshot({ path: path.join(directory, `${provider}.png`) });
  }
  assert.deepEqual(errors, []);
  const anonymous = await fetch('http://localhost:3000/api/works?limit=1');
  assert.equal((await anonymous.json()).totalDocs, 0);
  report = { passed: true, results, originalDatabaseUnchanged: true };
  await writeFile(path.join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser?.close();
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  for (const child of children) {
    await Promise.race([child.finished, sleep(5000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  for (const [index, child] of children.entries())
    await writeFile(path.join(directory, `process-${index}.log`), child.output());
  assert.equal(await hash(), before, 'The real local dataset must remain unchanged');
  for (const name of ['payload.db', 'payload.db-wal', 'payload.db-shm', 'media'])
    await rm(path.join(directory, name), { recursive: true, force: true });
}
console.log(JSON.stringify({ ...report, evidence: directory }, null, 2));
