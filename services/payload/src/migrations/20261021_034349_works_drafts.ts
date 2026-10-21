import { MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  const foreignKeys = await db.all<{ foreign_keys: number }>(sql`PRAGMA foreign_keys;`)
  if (foreignKeys[0]?.foreign_keys !== 0) {
    throw new Error('Works draft migration requires a dedicated migration connection outside a transaction; no existing data was changed')
  }
  try {
    await db.transaction(async transaction => {
      const inherited = await transaction.all<{ foreign_keys: number }>(sql`PRAGMA foreign_keys;`)
      if (inherited[0]?.foreign_keys !== 0) throw new Error('Migration transaction must keep foreign-key cascades disabled')
      await transaction.run(sql`CREATE TABLE \`_works_v_version_experiences\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` integer PRIMARY KEY NOT NULL,
        \`started_on\` text,
        \`ended_on\` text,
        \`status\` text DEFAULT 'completed',
        \`platform\` text,
        \`progress\` text,
        \`note\` text,
        \`_uuid\` text,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`_works_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
      );
      `)
      await transaction.run(sql`CREATE INDEX \`_works_v_version_experiences_order_idx\` ON \`_works_v_version_experiences\` (\`_order\`);`)
      await transaction.run(sql`CREATE INDEX \`_works_v_version_experiences_parent_id_idx\` ON \`_works_v_version_experiences\` (\`_parent_id\`);`)
      await transaction.run(sql`CREATE TABLE \`_works_v_version_sources\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` integer PRIMARY KEY NOT NULL,
        \`provider\` text,
        \`external_id\` text,
        \`url\` text,
        \`fetched_at\` text,
        \`_uuid\` text,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`_works_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
      );
      `)
      await transaction.run(sql`CREATE INDEX \`_works_v_version_sources_order_idx\` ON \`_works_v_version_sources\` (\`_order\`);`)
      await transaction.run(sql`CREATE INDEX \`_works_v_version_sources_parent_id_idx\` ON \`_works_v_version_sources\` (\`_parent_id\`);`)
      await transaction.run(sql`CREATE TABLE \`_works_v\` (
        \`id\` integer PRIMARY KEY NOT NULL,
        \`parent_id\` integer,
        \`version_type\` text DEFAULT 'game',
        \`version_title\` text,
        \`version_generate_slug\` integer DEFAULT true,
        \`version_slug\` text,
        \`version_rating\` numeric,
        \`version_status\` text DEFAULT 'completed',
        \`version_note\` text,
        \`version_article_id\` integer,
        \`version_cover_id\` integer,
        \`version_cover_url\` text,
        \`version_release_date\` text,
        \`version_description\` text,
        \`version_visibility\` text DEFAULT 'private',
        \`version_updated_at\` text,
        \`version_created_at\` text,
        \`version__status\` text DEFAULT 'draft',
        \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
        \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
        \`latest\` integer,
        FOREIGN KEY (\`parent_id\`) REFERENCES \`works\`(\`id\`) ON UPDATE no action ON DELETE set null,
        FOREIGN KEY (\`version_article_id\`) REFERENCES \`cms_posts\`(\`id\`) ON UPDATE no action ON DELETE set null,
        FOREIGN KEY (\`version_cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
      );
      `)
      await transaction.run(sql`CREATE INDEX \`_works_v_parent_idx\` ON \`_works_v\` (\`parent_id\`);`)
      await transaction.run(sql`CREATE INDEX \`_works_v_version_version_slug_idx\` ON \`_works_v\` (\`version_slug\`);`)
      await transaction.run(sql`CREATE INDEX \`_works_v_version_version_article_idx\` ON \`_works_v\` (\`version_article_id\`);`)
      await transaction.run(sql`CREATE INDEX \`_works_v_version_version_cover_idx\` ON \`_works_v\` (\`version_cover_id\`);`)
      await transaction.run(sql`CREATE INDEX \`_works_v_version_version_updated_at_idx\` ON \`_works_v\` (\`version_updated_at\`);`)
      await transaction.run(sql`CREATE INDEX \`_works_v_version_version_created_at_idx\` ON \`_works_v\` (\`version_created_at\`);`)
      await transaction.run(sql`CREATE INDEX \`_works_v_version_version__status_idx\` ON \`_works_v\` (\`version__status\`);`)
      await transaction.run(sql`CREATE INDEX \`_works_v_created_at_idx\` ON \`_works_v\` (\`created_at\`);`)
      await transaction.run(sql`CREATE INDEX \`_works_v_updated_at_idx\` ON \`_works_v\` (\`updated_at\`);`)
      await transaction.run(sql`CREATE INDEX \`_works_v_latest_idx\` ON \`_works_v\` (\`latest\`);`)
      await transaction.run(sql`CREATE TABLE \`_works_v_texts\` (
        \`id\` integer PRIMARY KEY NOT NULL,
        \`order\` integer NOT NULL,
        \`parent_id\` integer NOT NULL,
        \`path\` text NOT NULL,
        \`text\` text,
        FOREIGN KEY (\`parent_id\`) REFERENCES \`_works_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
      );
      `)
      await transaction.run(sql`CREATE INDEX \`_works_v_texts_order_parent\` ON \`_works_v_texts\` (\`order\`,\`parent_id\`);`)
        await transaction.run(sql`CREATE TABLE \`__new_works_sources\` (
          \`_order\` integer NOT NULL,
          \`_parent_id\` integer NOT NULL,
          \`id\` text PRIMARY KEY NOT NULL,
          \`provider\` text,
          \`external_id\` text,
          \`url\` text,
          \`fetched_at\` text,
          FOREIGN KEY (\`_parent_id\`) REFERENCES \`works\`(\`id\`) ON UPDATE no action ON DELETE cascade
        );
        `)
        await transaction.run(sql`INSERT INTO \`__new_works_sources\`("_order", "_parent_id", "id", "provider", "external_id", "url", "fetched_at") SELECT "_order", "_parent_id", "id", "provider", "external_id", "url", "fetched_at" FROM \`works_sources\`;`)
        await transaction.run(sql`DROP TABLE \`works_sources\`;`)
        await transaction.run(sql`ALTER TABLE \`__new_works_sources\` RENAME TO \`works_sources\`;`)
        await transaction.run(sql`CREATE INDEX \`works_sources_order_idx\` ON \`works_sources\` (\`_order\`);`)
        await transaction.run(sql`CREATE INDEX \`works_sources_parent_id_idx\` ON \`works_sources\` (\`_parent_id\`);`)
        await transaction.run(sql`CREATE TABLE \`__new_works\` (
          \`id\` integer PRIMARY KEY NOT NULL,
          \`type\` text DEFAULT 'game',
          \`title\` text,
          \`generate_slug\` integer DEFAULT true,
          \`slug\` text,
          \`rating\` numeric,
          \`status\` text DEFAULT 'planned',
          \`note\` text,
          \`article_id\` integer,
          \`cover_id\` integer,
          \`cover_url\` text,
          \`release_date\` text,
          \`description\` text,
          \`visibility\` text DEFAULT 'private',
          \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
          \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
          \`_status\` text DEFAULT 'draft',
          FOREIGN KEY (\`article_id\`) REFERENCES \`cms_posts\`(\`id\`) ON UPDATE no action ON DELETE set null,
          FOREIGN KEY (\`cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
        );
        `)
        await transaction.run(sql`INSERT INTO \`__new_works\`("id", "type", "title", "generate_slug", "slug", "rating", "status", "note", "article_id", "cover_id", "cover_url", "release_date", "description", "visibility", "updated_at", "created_at", "_status") SELECT "id", "type", "title", "generate_slug", "slug", "rating", "status", "note", "article_id", "cover_id", "cover_url", "release_date", "description", "visibility", "updated_at", "created_at", CASE WHEN "visibility" = 'public' THEN 'published' ELSE 'draft' END FROM \`works\`;`)
        await transaction.run(sql`DROP TABLE \`works\`;`)
        await transaction.run(sql`ALTER TABLE \`__new_works\` RENAME TO \`works\`;`)
        await transaction.run(sql`CREATE UNIQUE INDEX \`works_slug_idx\` ON \`works\` (\`slug\`);`)
        await transaction.run(sql`CREATE INDEX \`works_article_idx\` ON \`works\` (\`article_id\`);`)
        await transaction.run(sql`CREATE INDEX \`works_cover_idx\` ON \`works\` (\`cover_id\`);`)
        await transaction.run(sql`CREATE INDEX \`works_updated_at_idx\` ON \`works\` (\`updated_at\`);`)
        await transaction.run(sql`CREATE INDEX \`works_created_at_idx\` ON \`works\` (\`created_at\`);`)
        await transaction.run(sql`CREATE INDEX \`works__status_idx\` ON \`works\` (\`_status\`);`)

        // Seed one immutable version from every pre-migration Work. Public rows remain
        // published; private rows begin as drafts. Preserve all array identities via _uuid.
        await transaction.run(sql`INSERT INTO \`_works_v\` (
          id, parent_id, version_type, version_title, version_generate_slug, version_slug,
          version_rating, version_status, version_note, version_article_id, version_cover_id,
          version_cover_url, version_release_date, version_description, version_visibility,
          version_updated_at, version_created_at, version__status, created_at, updated_at, latest
        ) SELECT id, id, type, title, generate_slug, slug, rating, status, note, article_id,
          cover_id, cover_url, release_date, description, visibility, updated_at, created_at,
          _status, created_at, updated_at, 1 FROM \`works\`;`)
        await transaction.run(sql`INSERT INTO \`_works_v_version_experiences\`
          (_order, _parent_id, started_on, ended_on, status, platform, progress, note, _uuid)
          SELECT _order, _parent_id, started_on, ended_on, status, platform, progress, note, id
          FROM \`works_experiences\`;`)
        await transaction.run(sql`INSERT INTO \`_works_v_version_sources\`
          (_order, _parent_id, provider, external_id, url, fetched_at, _uuid)
          SELECT _order, _parent_id, provider, external_id, url, fetched_at, id FROM \`works_sources\`;`)
        // Native version text relationships are nested under version.*, unlike
        // base paths. Plain paths silently disappear from draft list reads.
        await transaction.run(sql`INSERT INTO \`_works_v_texts\` (id, \`order\`, parent_id, path, text)
          SELECT id, \`order\`, parent_id, 'version.' || path, text FROM \`works_texts\`;`)
        const broken = await transaction.all(sql`PRAGMA foreign_key_check;`)
        if (broken.length) throw new Error('Works draft migration failed foreign-key integrity check')
    })
  } finally {
    await db.run(sql`PRAGMA foreign_keys=ON;`)
  }

}

export async function down(): Promise<void> {
  throw new Error('Preserve Work drafts and version history: use a reviewed draft-compatible application release without dropping these tables; restoring a verified database/media backup requires a separate recovery plan that preserves newer edits.')
}
