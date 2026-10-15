import { MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`cms_posts\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text,
    \`markdown\` text,
    \`link\` text,
    \`locale\` text DEFAULT 'zh',
    \`published_at\` text,
    \`description\` text,
    \`cover_id\` integer,
    \`categories\` text,
    \`frontmatter\` text,
    \`protected_content\` integer DEFAULT false,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`_status\` text DEFAULT 'draft',
    FOREIGN KEY (\`cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`cms_posts_cover_idx\` ON \`cms_posts\` (\`cover_id\`);`)
  await db.run(sql`CREATE INDEX \`cms_posts_updated_at_idx\` ON \`cms_posts\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`cms_posts_created_at_idx\` ON \`cms_posts\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`cms_posts__status_idx\` ON \`cms_posts\` (\`_status\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`locale_link_idx\` ON \`cms_posts\` (\`locale\`,\`link\`);`)
  await db.run(sql`CREATE TABLE \`cms_posts_texts\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer NOT NULL,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`text\` text,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`cms_posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`cms_posts_texts_order_parent\` ON \`cms_posts_texts\` (\`order\`,\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_cms_posts_v\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`parent_id\` integer,
    \`version_title\` text,
    \`version_markdown\` text,
    \`version_link\` text,
    \`version_locale\` text DEFAULT 'zh',
    \`version_published_at\` text,
    \`version_description\` text,
    \`version_cover_id\` integer,
    \`version_categories\` text,
    \`version_frontmatter\` text,
    \`version_protected_content\` integer DEFAULT false,
    \`version_updated_at\` text,
    \`version_created_at\` text,
    \`version__status\` text DEFAULT 'draft',
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`latest\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`cms_posts\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`version_cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_cms_posts_v_parent_idx\` ON \`_cms_posts_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_cms_posts_v_version_version_cover_idx\` ON \`_cms_posts_v\` (\`version_cover_id\`);`)
  await db.run(sql`CREATE INDEX \`_cms_posts_v_version_version_updated_at_idx\` ON \`_cms_posts_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_cms_posts_v_version_version_created_at_idx\` ON \`_cms_posts_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_cms_posts_v_version_version__status_idx\` ON \`_cms_posts_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_cms_posts_v_created_at_idx\` ON \`_cms_posts_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_cms_posts_v_updated_at_idx\` ON \`_cms_posts_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_cms_posts_v_latest_idx\` ON \`_cms_posts_v\` (\`latest\`);`)
  await db.run(sql`CREATE INDEX \`version_locale_version_link_idx\` ON \`_cms_posts_v\` (\`version_locale\`,\`version_link\`);`)
  await db.run(sql`CREATE TABLE \`_cms_posts_v_texts\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer NOT NULL,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`text\` text,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`_cms_posts_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_cms_posts_v_texts_order_parent\` ON \`_cms_posts_v_texts\` (\`order\`,\`parent_id\`);`)
  // Preserve all legacy tables and lock relations; only add nullable columns.
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`cms_posts_id\` integer REFERENCES cms_posts(id) ON DELETE CASCADE;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_cms_posts_id_idx\` ON \`payload_locked_documents_rels\` (\`cms_posts_id\`);`)
  await db.run(sql`ALTER TABLE \`works\` ADD \`article_id\` integer REFERENCES cms_posts(id) ON DELETE SET NULL;`)
  await db.run(sql`CREATE INDEX \`works_article_idx\` ON \`works\` (\`article_id\`);`)
}

export async function down(): Promise<void> {
  throw new Error('Preserve authored articles: roll back application code without dropping these tables, or restore a verified database/media backup.')
}
