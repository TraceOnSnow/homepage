import { fetchLibraryWorks } from './data';
import type { LibraryWork } from './types';

// Server/build only. Visitors receive the sanitized records, never an API client or credentials.
let records: Promise<LibraryWork[]> | undefined;
export function loadLibraryWorks(): Promise<LibraryWork[]> {
  const base = import.meta.env.PAYLOAD_URL;
  if (!base) return Promise.resolve([]);
  if (import.meta.env.DEV) return fetchLibraryWorks(base);
  records ??= fetchLibraryWorks(base);
  return records;
}
