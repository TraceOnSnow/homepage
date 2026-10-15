import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
mkdirSync('storage/media', { recursive: true })
if (!existsSync('.env')) {
  writeFileSync('.env', `PAYLOAD_SECRET=${randomBytes(32).toString('hex')}\nDATABASE_URL=file:./storage/payload.db\nSERVER_URL=http://localhost:3000\n`, { mode: 0o600 })
  console.log('Created .env with a random Payload secret. Add provider credentials there.')
} else console.log('Existing .env preserved.')
