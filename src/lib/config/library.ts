export function normalizeLibraryConfig(raw: unknown): { enabled: boolean } {
  return { enabled: typeof raw === 'object' && raw !== null && 'enabled' in raw && raw.enabled === true };
}
