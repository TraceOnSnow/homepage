import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContentClient, runCLI } from '../scripts/content-client.mjs';

test('installed skill works through a directory symlink outside the repository without dependencies or credentials', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'content-skill-install-'));
  try {
    const link = path.join(directory, 'homepage-content');
    symlinkSync(fileURLToPath(new URL('../skills/homepage-content', import.meta.url)), link, 'dir');
    const output = execFileSync(process.execPath, [path.join(link, 'scripts/content-client.mjs'), '--help'], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.match(JSON.parse(output).usage, /posts publish/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

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

test('Markdown-only article edits still accept an empty JSON patch with --markdown', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'content-markdown-only-'));
  try {
    const file = path.join(directory, 'patch.json');
    const markdown = path.join(directory, 'body.md');
    writeFileSync(file, '{}');
    writeFileSync(markdown, '# Kept as Markdown\n');
    const result = await runCLI(['posts', 'update', '1', file, '--markdown', markdown], async (method) => {
      assert.equal(method, 'GET');
      return { id: 1, updatedAt: '2026-01-01T00:00:00Z' };
    });
    assert.equal(result.data.markdown, '# Kept as Markdown\n');
    assert.equal(result.dryRun, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('new personal records default completed and private, while explicit planned and unknown statuses stay intact', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'content-work-default-'));
  try {
    const file = path.join(directory, 'work.json');
    for (const status of [undefined, 'planned', null]) {
      writeFileSync(
        file,
        JSON.stringify({
          title: 'Recorded work',
          slug: 'recorded-work',
          type: 'movie',
          ...(status === undefined ? {} : { status }),
        }),
      );
      const preview = await runCLI(['works', 'create', file], async () => ({ totalDocs: 0 }));
      assert.equal(preview.data.status, status === undefined ? 'completed' : status);
      assert.equal(preview.data.visibility, 'private');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function withManifest(items, callback) {
  const directory = mkdtempSync(path.join(tmpdir(), 'content-import-'));
  const file = path.join(directory, 'works.json');
  try {
    writeFileSync(file, JSON.stringify(items), { mode: 0o600 });
    return await callback(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const batchWork = (slug, extra = {}) => ({ title: slug, slug, type: 'game', ...extra });

test('batch preview reads every page, skips identities and manifest duplicates, and never overwrites ratings', async () => {
  const original = batchWork('original', { id: 2, rating: 9, sources: [{ provider: 'igdb', externalId: '42' }] });
  const input = [
    batchWork('renamed', { rating: 1, sources: original.sources }),
    batchWork('fresh', { status: null }),
    batchWork('fresh'),
  ];
  await withManifest(input, async (file) => {
    const pages = [];
    const result = await runCLI(['works', 'import', file], async (method, resource, { query }) => {
      assert.equal(method, 'GET');
      assert.equal(resource, 'works');
      pages.push(query.page);
      return query.page === '1'
        ? { docs: [batchWork('unrelated', { id: 1 })], hasNextPage: true }
        : { docs: [original], hasNextPage: false };
    });
    assert.deepEqual(pages, ['1', '2']);
    assert.deepEqual(result.summary, { create: 1, created: 0, existing: 2, review: 0 });
    assert.equal(result.results[1].data.visibility, 'private');
    assert.equal(result.results[1].data.status, null);
    assert.equal(result.results[2].reason, 'duplicate-in-manifest');
    assert.equal(original.rating, 9);
  });
});

test('batch treats same-title different sources and unrelated slug collisions as review instead of writes', async () => {
  const original = batchWork('legacy-slug', { id: 1, title: 'Another title' });
  const edition = batchWork('edition-one', {
    id: 2,
    title: 'Same title',
    sources: [{ provider: 'catalogue', externalId: 'one' }],
  });
  await withManifest(
    [
      batchWork('legacy-slug'),
      batchWork('edition-two', { title: 'Same title', sources: [{ provider: 'catalogue', externalId: 'two' }] }),
    ],
    async (file) => {
      const result = await runCLI(['works', 'import', file, '--apply'], async (method) => {
        assert.equal(method, 'GET');
        return { docs: [original, edition], hasNextPage: false };
      });
      assert.deepEqual(
        result.results.map((item) => item.reason),
        ['slug-collision', 'same-title-different-source'],
      );
      assert.equal(result.summary.review, 2);
    },
  );
});

test('batch rejects a malformed later item before any API write or read', async () => {
  for (const invalid of [
    batchWork('bad', { _status: 'published' }),
    batchWork('bad', { type: 'music' }),
    batchWork('bad', { sources: [{ provider: 'igdb' }] }),
    batchWork('bad', { aliases: 'alias' }),
  ]) {
    await withManifest([batchWork('valid'), invalid], async (file) => {
      await assert.rejects(runCLI(['works', 'import', file, '--apply'], () => assert.fail('No request expected')));
    });
  }
});

test('batch applies through ordinary Works CRUD, reads back, and reruns without creating duplicates', async () => {
  const documents = [];
  let writes = 0;
  const request = async (method, resource, { id, data } = {}) => {
    assert.equal(resource, 'works');
    if (method === 'GET') return id ? documents.find((doc) => doc.id === id) : { docs: documents, hasNextPage: false };
    assert.equal(method, 'POST');
    writes++;
    const doc = { ...data, id: documents.length + 1 };
    documents.push(doc);
    return { doc };
  };
  await withManifest([batchWork('Recorded__Work', { rating: 8, experiences: [{ endedOn: '2024-09' }] })], async (file) => {
    const first = await runCLI(['works', 'import', file, '--apply'], request);
    const second = await runCLI(['works', 'import', file, '--apply'], request);
    assert.equal(first.summary.created, 1);
    assert.equal(second.summary.existing, 1);
    assert.equal(writes, 1);
    assert.equal(documents[0].visibility, 'private');
    assert.equal(documents[0].status, 'completed');
    assert.equal(documents[0].slug, 'recorded-work');
    assert.equal(documents[0].generateSlug, false);
    assert.equal(documents[0].experiences[0].endedOn, '2024-09');
  });
});

test('batch never retries a timed-out POST, refreshes identities, and continues independent records', async () => {
  const documents = [];
  let writes = 0;
  await withManifest([batchWork('uncertain'), batchWork('uncertain'), batchWork('next')], async (file) => {
    const result = await runCLI(['works', 'import', file, '--apply'], async (method, _resource, { id, data } = {}) => {
      if (method === 'GET') return id ? documents.find((doc) => doc.id === id) : { docs: documents, hasNextPage: false };
      assert.equal(method, 'POST');
      writes++;
      const doc = { ...data, id: writes };
      documents.push(doc);
      if (writes === 1) throw Error('private upstream details must not appear in report');
      return { doc };
    });
    assert.equal(writes, 2);
    assert.deepEqual(
      result.results.map((item) => item.outcome),
      ['review', 'existing', 'created'],
    );
    assert.deepEqual(result.results[0].ids, [1]);
    assert.doesNotMatch(JSON.stringify(result), /private upstream/);
  });
});

test('batch stops when a failed write cannot be checked and refuses incomplete pagination', async () => {
  await withManifest([batchWork('first'), batchWork('second')], async (file) => {
    let writes = 0;
    await assert.rejects(
      runCLI(['works', 'import', file, '--apply'], async (method) => {
        if (method === 'GET' && !writes) return { docs: [], hasNextPage: false };
        if (method === 'POST') writes++;
        throw Error('offline');
      }),
      /Import stopped/,
    );
    assert.equal(writes, 1);
    await assert.rejects(
      runCLI(['works', 'import', file, '--apply'], async (method) => {
        assert.equal(method, 'GET');
        return { docs: [], hasNextPage: true };
      }),
      /incomplete duplicate check/,
    );
  });
});

test('batch flags mismatched personal readback without repeating the creation', async () => {
  const doc = batchWork('rating', { id: 1, visibility: 'private', status: 'completed', rating: 2 });
  let writes = 0;
  await withManifest([batchWork('rating', { rating: 9 })], async (file) => {
    const result = await runCLI(['works', 'import', file, '--apply'], async (method, _resource, { id } = {}) => {
      if (method === 'POST') {
        writes++;
        return { doc };
      }
      return id ? doc : { docs: writes ? [doc] : [], hasNextPage: false };
    });
    assert.equal(result.summary.review, 1);
    assert.equal(writes, 1);
  });
});
