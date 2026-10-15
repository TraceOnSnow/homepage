import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTS from 'eslint-config-next/typescript'
export default defineConfig([
  ...nextVitals, ...nextTS,
  globalIgnores(['.next/**', 'legacy/**', 'src/payload-types.ts', 'src/migrations/**', 'src/app/(payload)/admin/importMap.js']),
  { rules: { '@next/next/no-img-element': 'off' } },
])
