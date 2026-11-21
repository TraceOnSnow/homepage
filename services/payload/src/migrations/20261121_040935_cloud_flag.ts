import { MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

// Additive only: two nullable-safe columns defaulting to "not 云". No table rebuild,
// content rewrite, version reseeding, publication or timestamp change.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.transaction(async transaction => {
    await transaction.run(sql`ALTER TABLE "works" ADD "cloud" integer DEFAULT false;`)
    await transaction.run(sql`ALTER TABLE "_works_v" ADD "version_cloud" integer DEFAULT false;`)
    const broken = await transaction.all(sql`PRAGMA foreign_key_check;`)
    if (broken.length) throw new Error('Cloud flag migration failed foreign-key integrity check')
  })
}

export async function down(): Promise<void> {
  throw new Error('Preserve 云 flags. Roll back only to a cloud-compatible release; never drop the cloud columns.')
}
