import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`posts\` ADD \`generate_slug\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`_posts_v\` ADD \`version_generate_slug\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`works\` ADD \`generate_slug\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`projects\` ADD \`generate_slug\` integer DEFAULT true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`posts\` DROP COLUMN \`generate_slug\`;`)
  await db.run(sql`ALTER TABLE \`_posts_v\` DROP COLUMN \`version_generate_slug\`;`)
  await db.run(sql`ALTER TABLE \`works\` DROP COLUMN \`generate_slug\`;`)
  await db.run(sql`ALTER TABLE \`projects\` DROP COLUMN \`generate_slug\`;`)
}
