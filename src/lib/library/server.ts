import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type CoverManifest, localCoverUrl, MANIFEST_FILE } from './cover-cache';
import { fetchLibraryWorks, publicLibraryWork } from './data';
import type { LibraryWork } from './types';

// Server/build only. Visitors receive the sanitized records, never an API client or credentials.
let records: Promise<LibraryWork[]> | undefined;
export function loadLibraryWorks(): Promise<LibraryWork[]> {
  const base = import.meta.env.PAYLOAD_URL;
  if (!base) return Promise.resolve([]);
  const snapshot = import.meta.env.CONTENT_BUILD_SNAPSHOT;
  if (snapshot) {
    records ??= Promise.all([readFile(snapshot, 'utf8'), readCoverManifest()]).then(([text, covers]) => {
      const data = JSON.parse(text);
      if (!Array.isArray(data.works)) throw new Error('Invalid frozen Works snapshot.');
      return data.works
        .map((doc: unknown) => publicLibraryWork(doc, base))
        .filter((work: LibraryWork | undefined): work is LibraryWork => Boolean(work))
        .map((work: LibraryWork) => ({ ...work, coverUrl: localCoverUrl(work.coverUrl, covers) }));
    });
    return records;
  }
  if (import.meta.env.DEV) return fetchLibraryWorks(base);
  records ??= fetchLibraryWorks(base);
  return records;
}

// Written by the library-covers integration for this build; absent when cover caching is off.
async function readCoverManifest(): Promise<CoverManifest | undefined> {
  try {
    return JSON.parse(await readFile(path.resolve('.cache/library-covers', MANIFEST_FILE), 'utf8'));
  } catch {
    return undefined;
  }
}
