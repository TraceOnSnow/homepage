import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCLI } from '../scripts/content-client.mjs';
import { workEnrichment } from '../skills/homepage-content/scripts/work-enrichment.mjs';

const source = {
  provider: 'web',
  externalId: 'https://publisher.example/book/123',
  url: 'https://publisher.example/book/123',
  fetchedAt: '2026-10-20T00:00:00.000Z',
};
const facts = { coverUrl: 'https://publisher.example/cover.jpg', creators: ['Author'], sources: [source] };
const original = {
  id: 7,
  title: 'Book',
  updatedAt: '2026-10-19T00:00:00.000Z',
  coverUrl: null,
  creators: [],
  sources: [{ ...source, id: 'preserve-child-id' }],
  rating: 9,
  note: 'Personal thought',
  status: 'in-progress',
  experiences: [{ id: 'experience', endedOn: '2020' }],
  visibility: 'private',
};

test('enrichment fills empty facts, preserves existing values and array child IDs, and is repeatable', () => {
  const candidate = { ...facts, description: 'Short factual summary', aliases: ['Alternative'] };
  const current = { ...original, description: 'Keep this', sources: [{ ...source, externalId: 'old', id: 'keep' }] };
  const result = workEnrichment(current, candidate);
  assert.deepEqual(result.skipped, ['description']);
  assert.equal(result.data.coverUrl, facts.coverUrl);
  assert.deepEqual(result.data.creators, ['Author']);
  assert.equal(result.data.sources[0].id, 'keep');
  assert.equal(result.data.sources.length, 2);
  assert.equal(original.rating, 9);
  const repeated = workEnrichment({ ...current, ...result.data }, candidate);
  assert.deepEqual(repeated.data, {});
  assert.deepEqual(workEnrichment({ ...original, cover: 12 }, facts).data, { creators: ['Author'] });
});

test('enrichment rejects personal data, unsupported fields, missing provenance and invalid URLs', () => {
  for (const field of ['rating', 'note', 'status', 'visibility', 'experiences', 'title', 'article', 'slug'])
    assert.throws(() => workEnrichment(original, { ...facts, [field]: 'injected' }), /factual/);
  for (const sources of [undefined, [], [{ ...source, url: 'http://publisher.example/book' }]])
    assert.throws(() => workEnrichment(original, { ...facts, sources }));
  assert.throws(() => workEnrichment(original, { ...facts, coverUrl: 'https://user:pass@example.com/x' }));
  assert.throws(() => workEnrichment(original, { ...facts, creators: [''] }));
  assert.throws(() => workEnrichment(original, { ...facts, sources: [{ ...source, fetchedAt: 'unknown' }] }));
});

test('CLI enrichment previews, checks versions, applies once and reads back; repeats never write', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'content-enrich-'));
  try {
    const file = path.join(directory, 'facts.json');
    writeFileSync(file, JSON.stringify(facts));
    let stored = structuredClone(original);
    const calls = [];
    const request = async (method, resource, input) => {
      calls.push({ method, resource, input });
      if (method === 'GET') return structuredClone(stored);
      assert.equal(method, 'PATCH');
      assert.deepEqual(input.data, { coverUrl: facts.coverUrl, creators: ['Author'] });
      assert.equal(input.query['where[and][1][updatedAt][equals]'], original.updatedAt);
      stored = { ...stored, ...input.data, updatedAt: '2026-10-20T00:00:00.000Z' };
      return { docs: [structuredClone(stored)] };
    };
    const preview = await runCLI(['works', 'enrich', '7', file], request);
    assert.equal(preview.dryRun, true);
    assert.deepEqual(
      calls.map((call) => call.method),
      ['GET'],
    );
    await assert.rejects(
      runCLI(['works', 'enrich', '7', file, '--apply', '--expected-updated-at', 'stale'], request),
      /changed/,
    );
    const result = await runCLI(['works', 'enrich', '7', file, '--apply'], request);
    assert.equal(result.rating, 9);
    assert.deepEqual(result.experiences, original.experiences);
    assert.deepEqual(
      calls.slice(-4).map((call) => call.method),
      ['GET', 'GET', 'PATCH', 'GET'],
    );
    assert.equal((await runCLI(['works', 'enrich', '7', file, '--apply'], request)).unchanged, true);
    assert.equal(calls.filter((call) => call.method === 'PATCH').length, 1);
    await assert.rejects(runCLI(['posts', 'enrich', '7', file], request), /only to works/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('enrichment stops on concurrent edits and detects a mismatched readback without retrying', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'content-enrich-conflict-'));
  try {
    const file = path.join(directory, 'facts.json');
    writeFileSync(file, JSON.stringify(facts));
    let reads = 0;
    const race = async (method) => {
      assert.equal(method, 'GET');
      return { ...original, updatedAt: reads++ ? 'changed' : original.updatedAt };
    };
    await assert.rejects(runCLI(['works', 'enrich', '7', file, '--apply'], race), /changed/);
    let writes = 0;
    await assert.rejects(
      runCLI(['works', 'enrich', '7', file, '--apply'], async (method) => {
        if (method === 'PATCH') {
          writes++;
          return { docs: [original] };
        }
        return original;
      }),
      /readback mismatch/,
    );
    assert.equal(writes, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
