import { MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`content_clients\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`enable_a_p_i_key\` integer,
  	\`api_key\` text,
  	\`api_key_index\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`content_clients_updated_at_idx\` ON \`content_clients\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`content_clients_created_at_idx\` ON \`content_clients\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`content_clients_id\` integer REFERENCES content_clients(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_content_clients_id_idx\` ON \`payload_locked_documents_rels\` (\`content_clients_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_preferences_rels\` ADD \`content_clients_id\` integer REFERENCES content_clients(id);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_content_clients_id_idx\` ON \`payload_preferences_rels\` (\`content_clients_id\`);`)
}

export async function down(): Promise<void> {
  throw new Error('Content client identities must not be dropped automatically. Restore reviewed code or a verified backup instead.')
}
