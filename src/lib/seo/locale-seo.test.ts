import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { getHreflangLocales, matchTrailingSlash } from './locale-alternates';
import { canonicalSitemapFilter, findCanonicalHref, isSelfCanonical } from './sitemap-canonical';

const enabledLocales = ['zh', 'en', 'ja', 'ko'];

test('fallback copies declare no hreflang alternates', () => {
  assert.deepEqual(getHreflangLocales({ pageLocale: 'en', contentLocale: 'zh', enabledLocales }), []);
});

test('UI pages keep every enabled locale as an alternate', () => {
  assert.deepEqual(getHreflangLocales({ pageLocale: 'en', contentLocale: 'en', enabledLocales }), enabledLocales);
});

test('posts list only locales with a real version, and none when there is only one', () => {
  const base = { pageLocale: 'zh', contentLocale: 'zh', enabledLocales };
  assert.deepEqual(getHreflangLocales({ ...base, availableLocales: ['zh'] }), []);
  assert.deepEqual(getHreflangLocales({ ...base, availableLocales: ['en', 'zh', 'fr'] }), ['zh', 'en']);
});

test('sibling-locale paths follow the page trailing slash', () => {
  assert.equal(matchTrailingSlash('/en/post/a/', '/post/a'), '/post/a/');
  assert.equal(matchTrailingSlash('/en/post/a', '/post/a'), '/post/a');
  assert.equal(matchTrailingSlash('/en/', '/'), '/');
});

test('finds the canonical link regardless of attribute order and quoting', () => {
  assert.equal(findCanonicalHref('<link rel="canonical" href="https://x.test/a/">'), 'https://x.test/a/');
  assert.equal(findCanonicalHref("<link href='https://x.test/b/' rel='canonical'>"), 'https://x.test/b/');
  assert.equal(findCanonicalHref('<link rel="alternate" href="https://x.test/c/">'), undefined);
});

test('self-canonical comparison ignores trailing slash and percent-encoding', () => {
  assert.ok(isSelfCanonical('https://x.test/post/a/', 'https://x.test/post/a'));
  assert.ok(isSelfCanonical('https://x.test/post/%E4%BD%A0/', 'https://x.test/post/你/'));
  assert.ok(isSelfCanonical('https://x.test/post/a/', undefined));
  assert.ok(!isSelfCanonical('https://x.test/en/post/a/', 'https://x.test/post/a/'));
});

test('sitemap filter drops built pages whose canonical names another URL', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-canonical-'));
  try {
    const page = (route: string, canonical: string) => {
      fs.mkdirSync(path.join(dir, route), { recursive: true });
      fs.writeFileSync(path.join(dir, route, 'index.html'), `<head><link rel="canonical" href="${canonical}"></head>`);
    };
    page('post/a', 'https://x.test/post/a/');
    page('en/post/a', 'https://x.test/post/a/');
    page('en', 'https://x.test/en/');
    const { integration, filter } = canonicalSitemapFilter();
    assert.ok(filter('https://x.test/en/post/a/'), 'nothing is filtered before the build output is known');
    integration.hooks['astro:build:done']?.({ dir: pathToFileURL(dir) } as never);
    assert.ok(filter('https://x.test/post/a/'));
    assert.ok(filter('https://x.test/en/'));
    assert.ok(!filter('https://x.test/en/post/a/'));
    assert.ok(filter('https://x.test/missing/'), 'pages without built HTML are kept');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
