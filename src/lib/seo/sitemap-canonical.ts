/**
 * Sitemap filter that keeps only self-canonical pages.
 *
 * `@astrojs/sitemap` passes the filter nothing but URLs, so the built HTML is read instead:
 * a page whose `<link rel="canonical">` names another URL (e.g. a locale fallback copy of a
 * post) is a duplicate and does not belong in the sitemap. The paired integration records the
 * build output directory; it must be registered before `sitemap()` because `astro:build:done`
 * hooks run in integration order.
 */

import fs from 'node:fs';
import type { AstroIntegration } from 'astro';

const LINK_TAG = /<link\b[^>]*>/gi;
const CANONICAL_REL = /\brel\s*=\s*(?:"canonical"|'canonical'|canonical(?=[\s/>]))/i;
const HREF_ATTR = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/** First `<link rel="canonical">` href in a document, if any. */
export function findCanonicalHref(html: string): string | undefined {
  for (const [tag] of html.matchAll(LINK_TAG)) {
    if (!CANONICAL_REL.test(tag)) continue;
    const match = tag.match(HREF_ATTR);
    const href = match?.[1] ?? match?.[2] ?? match?.[3];
    return href?.replaceAll('&amp;', '&');
  }
  return undefined;
}

function comparableUrl(url: URL): string {
  let pathname = url.pathname.replace(/\/+$/, '') || '/';
  try {
    pathname = decodeURI(pathname);
  } catch {
    // Keep the encoded form when it is not valid percent-encoding.
  }
  return `${url.origin}${pathname}${url.search}`;
}

/** True unless the canonical href names a different page (trailing slash and percent-encoding ignored). */
export function isSelfCanonical(pageUrl: string, canonicalHref: string | undefined): boolean {
  if (!canonicalHref) return true;
  try {
    return comparableUrl(new URL(canonicalHref, pageUrl)) === comparableUrl(new URL(pageUrl));
  } catch {
    return true;
  }
}

export function canonicalSitemapFilter(): { integration: AstroIntegration; filter: (page: string) => boolean } {
  let outputDir: URL | undefined;
  return {
    integration: {
      name: 'sitemap-canonical-pages',
      hooks: {
        'astro:build:done': ({ dir }) => {
          outputDir = dir.href.endsWith('/') ? dir : new URL(`${dir.href}/`);
        },
      },
    },
    filter(page) {
      if (!outputDir) return true;
      const { pathname } = new URL(page);
      const file = new URL(`.${pathname}${pathname.endsWith('/') ? 'index.html' : ''}`, outputDir);
      let html: string;
      try {
        html = fs.readFileSync(file, 'utf8');
      } catch {
        return true;
      }
      return isSelfCanonical(page, findCanonicalHref(html));
    },
  };
}
