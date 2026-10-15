import { readFile } from 'node:fs/promises';
import { fetchLibraryWorks, publicLibraryWork } from './data';
import type { LibraryWork } from './types';

// Server/build only. Visitors receive the sanitized records, never an API client or credentials.
let records: Promise<LibraryWork[]> | undefined;
export function loadLibraryWorks(): Promise<LibraryWork[]> {
  const base = import.meta.env.PAYLOAD_URL;
  if (!base) return Promise.resolve([]);
  const snapshot = import.meta.env.CONTENT_BUILD_SNAPSHOT;
  if (snapshot) {
    records ??= readFile(snapshot, 'utf8').then((text) => {
      const data = JSON.parse(text);
      if (!Array.isArray(data.works)) throw new Error('Invalid frozen Works snapshot.');
      return data.works
        .map((doc: unknown) => publicLibraryWork(doc, base))
        .filter((work: LibraryWork | undefined): work is LibraryWork => Boolean(work));
    });
    return records;
  }
  if (import.meta.env.DEV) return fetchLibraryWorks(base);
  records ??= fetchLibraryWorks(base);
  return records;
}
