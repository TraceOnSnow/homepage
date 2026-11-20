import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// Build-time copies of external Work covers, served from the site's own origin.
// Visitors then never depend on third-party image hosts (some are unreachable from mainland China).
// The cache persists between builds; a cover that cannot be fetched keeps its original URL.

export const COVER_PUBLIC_DIR = 'library-covers';
export const MANIFEST_FILE = 'manifest.json';
const MAX_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const RETRY_FAILED_AFTER_MS = 24 * 60 * 60 * 1000;

export type CoverManifest = Record<string, string>;
export type CoverTransform = (input: Buffer) => Promise<Buffer>;

export function coverFile(url: string): string {
  return `${createHash('sha256').update(url).digest('hex').slice(0, 24)}.webp`;
}

export async function sharpTransform(input: Buffer): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  sharp.cache(false);
  // Cards are 2:3 and at most ~200px wide; 400x600 covers 2x screens.
  return sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 400, height: 600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function recentlyFailed(file: string, now: number): Promise<boolean> {
  try {
    return now - (await fs.stat(file)).mtimeMs < RETRY_FAILED_AFTER_MS;
  } catch {
    return false;
  }
}

async function download(url: string, fetcher: typeof fetch): Promise<Buffer> {
  const response = await fetcher(url, {
    headers: { Accept: 'image/*', 'User-Agent': 'Mozilla/5.0 (compatible; site-cover-cache)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new Error(`not an image (${type || 'no content-type'})`);
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('image too large');
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_BYTES) throw new Error('image too large');
  return body;
}

/**
 * Ensure a local webp copy for each URL, fetching only what is missing.
 * Stops starting new downloads after `budgetMs`; the rest keep their original URL until a later build.
 */
export async function prepareCoverCache(options: {
  urls: Iterable<string>;
  directory: string;
  fetcher?: typeof fetch;
  transform?: CoverTransform;
  now?: () => number;
  concurrency?: number;
  budgetMs?: number;
  log?: (message: string) => void;
}): Promise<{ manifest: CoverManifest; fetched: number; failed: number; deferred: number }> {
  const {
    directory,
    fetcher = fetch,
    transform = sharpTransform,
    now = Date.now,
    concurrency = 4,
    budgetMs = 180_000,
    log = () => {},
  } = options;
  await fs.mkdir(directory, { recursive: true });
  const urls = [...new Set(options.urls)];
  const manifest: CoverManifest = {};
  const missing: string[] = [];
  for (const url of urls) {
    const file = coverFile(url);
    if (await exists(path.join(directory, file))) manifest[url] = file;
    else if (!(await recentlyFailed(path.join(directory, `${file}.fail`), now()))) missing.push(url);
  }
  const started = now();
  let fetched = 0;
  let failed = 0;
  let deferred = 0;
  let next = 0;
  async function worker() {
    while (next < missing.length) {
      const url = missing[next++];
      if (now() - started > budgetMs) {
        deferred += 1;
        continue;
      }
      const file = coverFile(url);
      const target = path.join(directory, file);
      try {
        const image = await transform(await download(url, fetcher));
        const temporary = `${target}.${process.pid}.tmp`;
        await fs.writeFile(temporary, image);
        await fs.rename(temporary, target);
        await fs.rm(`${target}.fail`, { force: true });
        manifest[url] = file;
        fetched += 1;
      } catch (error) {
        failed += 1;
        const reason = error instanceof Error ? error.message : String(error);
        await fs.writeFile(`${target}.fail`, `${url}\n${reason}\n`);
        log(`cover not cached (${new URL(url).host}): ${reason}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return { manifest, fetched, failed, deferred };
}

/** Point cached external covers at the local copy. */
export function localCoverUrl(url: string | undefined, manifest: CoverManifest | undefined): string | undefined {
  const file = url && manifest?.[url];
  return file ? `/${COVER_PUBLIC_DIR}/${file}` : url;
}
