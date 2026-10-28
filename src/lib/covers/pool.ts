import { readFile } from 'node:fs/promises';

/** Public image addresses only; no credentials, data URLs, or protocol-relative hosts. */
export function publicCoverURL(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[\p{Cc}]/u.test(value)) {
    return value;
  }
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function parseCoverPool(input: unknown, fallback: string[]): string[] {
  if (input === undefined) return [...fallback]; // Older frozen snapshots remain usable.
  if (
    !input ||
    typeof input !== 'object' ||
    !('version' in input) ||
    input.version !== 1 ||
    !('covers' in input) ||
    !Array.isArray(input.covers)
  )
    throw new Error('Invalid frozen article cover pool.');
  const covers = input.covers.map((value: unknown) => publicCoverURL(value));
  if (covers.some((value) => !value)) throw new Error('Article cover pool contains an unsafe image URL.');
  return covers.length ? [...new Set(covers as string[])] : [...fallback];
}

export function createCoverPoolLoader(options: {
  fallback: string[];
  snapshot?: string;
  base?: string;
  payloadMode: boolean;
  development: boolean;
  fetcher?: typeof fetch;
}) {
  let records: Promise<string[]> | undefined;
  return (): Promise<string[]> => {
    records ??= (async () => {
      if (options.snapshot) {
        const snapshot = JSON.parse(await readFile(options.snapshot, 'utf8'));
        return parseCoverPool(snapshot.coverPool, options.fallback);
      }
      if (!options.payloadMode) return [...options.fallback];
      if (!options.development) throw new Error('Payload article covers require CONTENT_BUILD_SNAPSHOT for production.');
      if (!options.base) throw new Error('Configure PAYLOAD_URL for article covers.');
      const base = publicCoverURL(options.base);
      if (!base) throw new Error('Invalid PAYLOAD_URL for article covers.');
      const response = await (options.fetcher ?? fetch)(new URL('api/site-covers', `${base.replace(/\/$/, '')}/`), {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Article cover pool unavailable (HTTP ${response.status}).`);
      return parseCoverPool(await response.json(), options.fallback);
    })();
    return records;
  };
}
