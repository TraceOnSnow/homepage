import { MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

// Additive only: no table rebuild, content rewrite, version reseeding, or deletion.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.transaction(async transaction => {
    await transaction.run(sql`ALTER TABLE "works" ADD "deleted_at" text;`)
    await transaction.run(sql`CREATE INDEX "works_deleted_at_idx" ON "works" ("deleted_at");`)
    await transaction.run(sql`ALTER TABLE "_works_v" ADD "version_deleted_at" text;`)
    await transaction.run(sql`CREATE INDEX "_works_v_version_version_deleted_at_idx" ON "_works_v" ("version_deleted_at");`)
    await transaction.run(sql`ALTER TABLE "cms_posts" ADD "deleted_at" text;`)
    await transaction.run(sql`CREATE INDEX "cms_posts_deleted_at_idx" ON "cms_posts" ("deleted_at");`)
    await transaction.run(sql`ALTER TABLE "_cms_posts_v" ADD "version_deleted_at" text;`)
    await transaction.run(sql`CREATE INDEX "_cms_posts_v_version_version_deleted_at_idx" ON "_cms_posts_v" ("version_deleted_at");`)
    const broken = await transaction.all(sql`PRAGMA foreign_key_check;`)
    if (broken.length) throw new Error('Content Trash migration failed foreign-key integrity check')
  })
}

export async function down(): Promise<void> {
  throw new Error('Preserve deleted content and history. Roll back only to a Trash-compatible release; never drop lifecycle columns.')
}
