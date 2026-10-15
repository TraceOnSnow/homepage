export function slugify(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
}

// Route params can retain percent escapes; keep Unicode CMS slugs queryable.
export function decodeSlug(value: string): string {
  try { return decodeURIComponent(value) } catch { return value }
}
