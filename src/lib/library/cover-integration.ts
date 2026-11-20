import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { COVER_PUBLIC_DIR, type CoverManifest, MANIFEST_FILE, prepareCoverCache } from './cover-cache';
import { publicLibraryWork } from './data';

const CACHE_DIR = path.resolve('.cache/library-covers');

/** External cover URLs of the public Works in a frozen build snapshot. */
export function externalCoverUrls(works: unknown[], base: string, siteUrl: string): string[] {
  const own = new Set([new URL(base).host, new URL(siteUrl).host]);
  const urls = new Set<string>();
  for (const doc of works) {
    const url = publicLibraryWork(doc, base)?.coverUrl;
    if (url && !own.has(new URL(url).host)) urls.add(url);
  }
  return [...urls];
}

/**
 * Caches external Work covers for publisher builds (frozen snapshot present) and ships the
 * referenced files with the site. `LIBRARY_COVER_CACHE=off` keeps the original external URLs.
 */
export function libraryCoversIntegration(env: Record<string, string>, siteUrl: string): AstroIntegration {
  let manifest: CoverManifest | undefined;
  return {
    name: 'library-covers',
    hooks: {
      'astro:config:setup': async ({ command, logger }) => {
        if (command !== 'build') return;
        await fs.rm(path.join(CACHE_DIR, MANIFEST_FILE), { force: true });
        if (!env.CONTENT_BUILD_SNAPSHOT || !env.PAYLOAD_URL || env.LIBRARY_COVER_CACHE === 'off') return;
        const snapshot = JSON.parse(await fs.readFile(env.CONTENT_BUILD_SNAPSHOT, 'utf8'));
        if (!Array.isArray(snapshot.works)) throw new Error('Invalid frozen Works snapshot.');
        const urls = externalCoverUrls(snapshot.works, env.PAYLOAD_URL, siteUrl);
        const result = await prepareCoverCache({ urls, directory: CACHE_DIR, log: (message) => logger.warn(message) });
        manifest = result.manifest;
        await fs.writeFile(path.join(CACHE_DIR, MANIFEST_FILE), JSON.stringify(manifest));
        logger.info(
          `covers: ${Object.keys(manifest).length}/${urls.length} local, ${result.fetched} new, ` +
            `${result.failed} failed, ${result.deferred} deferred to a later build`,
        );
      },
      'astro:build:done': async ({ dir }) => {
        if (!manifest) return;
        const target = path.join(fileURLToPath(dir), COVER_PUBLIC_DIR);
        await fs.mkdir(target, { recursive: true });
        // Only covers of currently public Works are published.
        for (const file of new Set(Object.values(manifest))) {
          await fs.copyFile(path.join(CACHE_DIR, file), path.join(target, file));
        }
      },
    },
  };
}
