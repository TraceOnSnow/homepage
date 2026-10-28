import { MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

// Committed with the data, before Payload records the migration itself. A crash
// between those steps must never multiply ratings twice.
export const ratingScaleMarker = 'data:personal-rating-scale:100:v1'

function percent(value: number): number {
  // Shift the stored decimal without losing finer legacy precision or introducing
  // floating-point tails such as 8.37 * 10 === 83.69999999999999.
  const [coefficient, exponent = '0'] = String(value).split('e')
  return Number(`${coefficient}e${Number(exponent) + 1}`)
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.transaction(async transaction => {
    const markers = await transaction.all(sql`SELECT name FROM payload_migrations WHERE name = ${ratingScaleMarker};`)
    if (markers.length) return
    const works = await transaction.all<{ id: number; rating: number | null }>(sql`SELECT id, rating FROM works;`)
    const versions = await transaction.all<{ id: number; rating: number | null }>(sql`SELECT id, version_rating AS rating FROM _works_v;`)
    // Preflight every row: a mixed/ambiguous scale must be investigated, never
    // guessed from individual magnitudes.
    for (const row of [...works, ...versions]) {
      if (row.rating !== null && (typeof row.rating !== 'number' || !Number.isFinite(row.rating) || row.rating < 0 || row.rating > 10)) {
        throw new Error(`Rating-scale migration requires an unconverted 0–10 database (row ${row.id})`)
      }
    }
    for (const row of works) {
      if (row.rating !== null) await transaction.run(sql`UPDATE works SET rating = ${percent(row.rating)} WHERE id = ${row.id};`)
    }
    for (const row of versions) {
      if (row.rating !== null) await transaction.run(sql`UPDATE _works_v SET version_rating = ${percent(row.rating)} WHERE id = ${row.id};`)
    }
    const broken = await transaction.all(sql`PRAGMA foreign_key_check;`)
    if (broken.length) throw new Error('Rating-scale migration failed foreign-key integrity check')
    await transaction.run(sql`INSERT INTO payload_migrations (name, batch, created_at, updated_at) VALUES (${ratingScaleMarker}, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));`)
  })
}

export async function down(): Promise<void> {
  throw new Error('Preserve hundred-point ratings and every version. Roll back only to a 0–100-compatible release; never divide or restore over newer edits.')
}
