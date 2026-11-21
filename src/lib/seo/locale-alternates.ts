/**
 * hreflang selection for locale-prefixed pages.
 *
 * A page rendered under a locale prefix whose content is in another language (a fallback copy)
 * is not a language version, so it declares no alternates; other pages list only the locales
 * that hold a real version of them.
 */

export interface HreflangOptions {
  /** Locale of the URL prefix (UI language). */
  pageLocale: string;
  /** Language the page's main content is written in. */
  contentLocale: string;
  /** Enabled locales, in configuration order. */
  enabledLocales: readonly string[];
  /** Locales with a real version of this page; omit when every enabled locale has one. */
  availableLocales?: readonly string[];
}

export function getHreflangLocales({ pageLocale, contentLocale, enabledLocales, availableLocales }: HreflangOptions): string[] {
  if (contentLocale !== pageLocale) return [];
  const available = availableLocales ? new Set(availableLocales) : undefined;
  const locales = enabledLocales.filter((locale) => !available || available.has(locale));
  // A single version has no alternates to declare.
  return locales.length > 1 ? locales : [];
}

/** Keep a sibling-locale path in the same trailing-slash form as the page's own URL. */
export function matchTrailingSlash(sourcePathname: string, path: string): string {
  return sourcePathname.endsWith('/') && !path.endsWith('/') ? `${path}/` : path;
}
