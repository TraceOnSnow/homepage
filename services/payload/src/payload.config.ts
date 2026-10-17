import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'
import { en } from '@payloadcms/translations/languages/en'
import { zh } from '@payloadcms/translations/languages/zh'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Works } from './collections/Works'
import { Posts } from './collections/Posts'
import { ContentClients } from './collections/ContentClients'
import { contentEndpoint } from './lib/content-endpoint'
import { libraryAgentEndpoint } from './lib/library-agent'
import { metadataEndpoints } from './lib/metadata/endpoint'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || '',
  serverURL: process.env.SERVER_URL || 'http://localhost:3000',
  i18n: { supportedLanguages: { en, zh }, fallbackLanguage: 'zh' },
  admin: { user: 'users', importMap: { baseDir: dirname } },
  collections: [Users, Works, Media, Posts, ContentClients],
  editor: lexicalEditor(), sharp,
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || 'file:./storage/payload.db' },
    migrationDir: path.resolve(dirname, 'migrations'),
    // Use migrations in development too, preserving archived legacy tables.
    push: false,
    // Enable explicit atomic bulk import only; keep normal runtime behavior unchanged.
    transactionOptions: process.env.PAYLOAD_IMPORT_TRANSACTION === '1' ? {} : undefined,
  }),
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  upload: { limits: { fileSize: 10_000_000 } },
  endpoints: [...metadataEndpoints, contentEndpoint, libraryAgentEndpoint],
})
