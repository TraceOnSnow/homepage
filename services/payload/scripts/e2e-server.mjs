import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const directory = mkdtempSync(join(tmpdir(), 'payload-e2e-'))
const production = process.env.E2E_PRODUCTION === '1'
const env = { ...process.env, NODE_ENV: 'production', DATABASE_URL: `file:${directory}/payload.db`, MEDIA_DIR: `${directory}/media`, DISABLE_PAYLOAD_HMR: 'true', CONTENT_BUILD_TOKEN: 'browser-read-only-build-token-at-least-32-characters',
  PAYLOAD_SECRET: 'disposable-browser-test-secret-not-for-production', SERVER_URL: 'http://127.0.0.1:3100',
  IGDB_CLIENT_ID: '', IGDB_CLIENT_SECRET: '', RAWG_API_KEY: '', GOOGLE_BOOKS_API_KEY: '', WEREAD_API_KEY: '', TMDB_API_KEY: '', TMDB_API_READ_ACCESS_TOKEN: '', BGG_API_TOKEN: '', BANGUMI_ACCESS_TOKEN: '' }
const code = await new Promise(resolve => spawn('node', ['node_modules/payload/bin.js', 'migrate'], { stdio: 'inherit', env }).on('exit', resolve))
if (code !== 0) { rmSync(directory, { recursive: true, force: true }); process.exit(1) }
env.NODE_ENV = production ? 'production' : 'development'
const child = spawn('node', ['node_modules/next/dist/bin/next', ...(production ? ['start'] : ['dev', '--webpack']), '--hostname', '127.0.0.1', '--port', '3100'], { stdio: 'inherit', env })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => { rmSync(directory, { recursive: true, force: true }); process.exit(code || 0) })
