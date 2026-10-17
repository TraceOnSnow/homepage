import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLibraryClient, runCLI } from '../scripts/library-agent.mjs';

test('help does not require authentication or issue a request', async () => {
  const result = await runCLI(['--help'], () => {
    throw Error('Help must not call the API');
  });
  assert.match(result.usage, /metadata-search/);
});

test('client sends a dedicated bearer only to a fixed endpoint and refuses redirects', async () => {
  const request = createLibraryClient({
    url: 'http://127.0.0.1:3000',
    token: 'a'.repeat(64),
    fetcher: async (url, init) => {
      assert.equal(url.href, 'http://127.0.0.1:3000/api/library-agent');
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, `Bearer ${'a'.repeat(64)}`);
      assert.deepEqual(JSON.parse(init.body), { action: 'list' });
      return Response.json({ docs: [] });
    },
  });
  assert.deepEqual(await request('list'), { docs: [] });
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/other'])
    assert.throws(() => createLibraryClient({ url, token: 'a'.repeat(64) }));
});

test('create is preview-only by default and refuses a known slug', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'library-client-'));
  try {
    const file = path.join(directory, 'work.json');
    writeFileSync(file, JSON.stringify({ title: 'Fixture', type: 'book', slug: 'fixture' }));
    const calls = [];
    const request = async (action) => {
      calls.push(action);
      return { totalDocs: 0 };
    };
    assert.equal((await runCLI(['create', file], request)).dryRun, true);
    assert.deepEqual(calls, ['list']);
    await runCLI(['create', file, '--apply'], request);
    assert.deepEqual(calls, ['list', 'list', 'create']);
    await assert.rejects(
      runCLI(['create', file, '--apply'], async () => ({ totalDocs: 1 })),
      /already exists/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('partial updates retain a reviewed version and stop after it changes', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'library-patch-'));
  try {
    const file = path.join(directory, 'patch.json');
    writeFileSync(file, JSON.stringify({ note: 'Explicitly requested note' }));
    const calls = [];
    const request = async (action, data) => {
      calls.push({ action, data });
      return action === 'get' ? { id: 2, updatedAt: '2020-01-01T00:00:00Z', rating: 9 } : data;
    };
    await runCLI(['update', '2', file, '--apply', '--expected-updated-at', '2020-01-01T00:00:00Z'], request);
    assert.deepEqual(calls.at(-1).data, {
      id: 2,
      expectedUpdatedAt: '2020-01-01T00:00:00Z',
      data: { note: 'Explicitly requested note' },
    });
    await assert.rejects(
      runCLI(['delete', '2', '--apply', '--expected-updated-at', '2019-01-01T00:00:00Z'], request),
      /changed/,
    );
    assert.equal(
      calls.some((call) => call.action === 'delete'),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
