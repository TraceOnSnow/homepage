import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createContentClient, runCLI } from '../scripts/content-client.mjs';

test('help works without credentials; native API keys cannot be sent to arbitrary resources or redirects', async () => {
  assert.match((await runCLI(['--help'], () => assert.fail())).usage, /posts publish/);
  const calls = [];
  const client = createContentClient({
    url: 'https://example.test',
    apiKey: 'a'.repeat(64),
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return Response.json({ docs: [] });
    },
  });
  await client('GET', 'posts', { query: { draft: 'true' } });
  assert.equal(calls[0].url.pathname, '/api/posts');
  assert.equal(calls[0].init.headers.Authorization, `content-clients API-Key ${'a'.repeat(64)}`);
  assert.equal(calls[0].init.redirect, 'error');
  await assert.rejects(client('GET', 'users'), /Unsupported/);
  for (const url of [
    'http://example.com',
    'https://user:pass@example.com',
    'https://example.com/path',
    'https://example.com?query',
  ])
    assert.throws(() => createContentClient({ url, apiKey: 'a'.repeat(64) }));
});

test('article creation preserves Markdown and defaults to a draft without writing during preview', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'content-cli-'));
  try {
    const file = path.join(directory, 'article.json');
    const markdown = path.join(directory, 'body.md');
    writeFileSync(file, JSON.stringify({ title: 'Article', link: 'note/article' }));
    writeFileSync(markdown, '\r\n++Original++\r\n');
    const calls = [];
    const request = async (method, resource, input) => {
      calls.push({ method, resource, input });
      return { totalDocs: 0 };
    };
    const preview = await runCLI(['posts', 'create', file, '--markdown', markdown], request);
    assert.equal(preview.data.markdown, '\r\n++Original++\r\n');
    assert.equal(preview.data._status, 'draft');
    assert.deepEqual(
      calls.map((call) => call.method),
      ['GET'],
    );
    await assert.rejects(
      runCLI(['posts', 'create', file, '--apply'], async () => ({ totalDocs: 1 })),
      /already exists/,
    );
    writeFileSync(file, JSON.stringify({ title: 'Escalation', link: 'x', _status: 'published' }));
    await assert.rejects(runCLI(['posts', 'create', file, '--apply'], request), /Unsupported/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('stale reviews and changes during application never issue a write', async () => {
  const calls = [];
  let version = 0;
  const request = async (method) => {
    calls.push(method);
    return { id: 1, updatedAt: `2026-01-01T00:00:0${version++}Z` };
  };
  await assert.rejects(
    runCLI(['works', 'delete', '1', '--apply', '--expected-updated-at', '2020-01-01T00:00:00Z'], request),
    /changed/,
  );
  await assert.rejects(runCLI(['works', 'delete', '1', '--apply'], request), /changed/);
  assert.ok(calls.every((method) => method === 'GET'));
});
