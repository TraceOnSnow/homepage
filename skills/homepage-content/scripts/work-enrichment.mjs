const factFields = ['coverUrl', 'description', 'releaseDate', 'creators', 'aliases', 'platforms'];
const listFields = ['creators', 'aliases', 'platforms'];

function httpsURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('Use public HTTPS source and cover URLs');
}

/** Build a fill-only patch from reviewed web/catalogue facts. No external fetch or model call. */
export function workEnrichment(current, candidate) {
  if (Object.keys(candidate).some((key) => ![...factFields, 'sources'].includes(key)))
    throw Error('Enrichment accepts factual metadata only; use works update for personal fields');
  if (!Array.isArray(candidate.sources) || candidate.sources.length === 0)
    throw Error('Enrichment requires at least one verified source');
  for (const source of candidate.sources) {
    if (
      !source ||
      typeof source !== 'object' ||
      Object.keys(source).some((key) => !['provider', 'externalId', 'url', 'fetchedAt'].includes(key)) ||
      ![source.provider, source.externalId, source.url, source.fetchedAt].every(
        (value) => typeof value === 'string' && value.trim(),
      ) ||
      !Number.isFinite(Date.parse(source.fetchedAt))
    )
      throw Error('Sources require provider, externalId, public HTTPS url and fetchedAt');
    httpsURL(source.url);
  }
  const data = {};
  const skipped = [];
  for (const field of factFields) {
    if (!Object.hasOwn(candidate, field)) continue;
    const value = candidate[field];
    if (listFields.includes(field)) {
      if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !item.trim()))
        throw Error(`Expected a nonempty text array for ${field}`);
    } else if (typeof value !== 'string' || !value.trim()) throw Error(`Expected nonempty text for ${field}`);
    if (field === 'coverUrl') httpsURL(value);
    if (field === 'releaseDate' && !Number.isFinite(Date.parse(value))) throw Error('Invalid releaseDate');
    const previous = current[field];
    const empty = listFields.includes(field)
      ? previous == null || (Array.isArray(previous) && previous.length === 0)
      : previous == null || (typeof previous === 'string' && !previous.trim());
    if (!empty || (field === 'coverUrl' && current.cover != null)) skipped.push(field);
    else data[field] = field === 'releaseDate' ? new Date(value).toISOString() : value;
  }
  // Only attach provenance when facts were actually added; repeats do not change timestamps.
  if (Object.keys(data).length) {
    const sources = [...(current.sources || [])];
    for (const source of candidate.sources) {
      if (!sources.some((old) => old.provider === source.provider && old.externalId === source.externalId))
        sources.push(source);
    }
    if (sources.length !== (current.sources || []).length) data.sources = sources;
  }
  return { data, skipped };
}
