# Repository Guidelines

## Project Structure & Module Organization

The repository root retains Astro Koharu's structure. Routes live in `src/pages/`, blog Markdown in `src/content/blog/`, components in `src/components/`, shared logic in `src/lib/`, and assets in `public/` and `src/assets/`. Tests are in `tests/` and colocated `*.test.ts` files. Site settings live in `config/site.yaml`.

`cms/` is Koharu's local Markdown editor. `services/payload/` is the independent Payload Admin/API for Works, Media, and Users. It retains its npm lockfile; run its commands inside that directory. `legacy/` contains complete local reference repositories, excluded from Git, checks, builds, and deployment. Preserve their files, databases, credentials, and uncommitted changes.

## Build, Test, and Development Commands

Use the Node engine and pinned pnpm version in `package.json`.

- `pnpm install --frozen-lockfile`: install the root and CMS workspace dependencies.
- `pnpm dev`: start Astro; `pnpm cms`: start the local Markdown CMS separately.
- `pnpm build` / `pnpm preview`: build and preview static `dist/`.
- `pnpm check` / `pnpm lint`: check Astro types and Biome rules.
- `pnpm test`: run existing Node test suites, including Library publication/privacy cases.
- `pnpm test:library:browser`: validate an isolated real Payload-to-static-Library workflow; rebuild normal output afterward.
- `pnpm test:editor` / `pnpm --dir cms build`: verify editor logic and CMS production output.

Restart development or rebuild after YAML configuration changes.

## Coding Style & Naming Conventions

Follow Koharu's Biome configuration: two spaces, single quotes, semicolons, and a 128-column width. Use PascalCase components, camelCase functions, and focused modules. Reuse native theme features before adding implementations. Keep the root theme and Payload independently buildable.

## Testing Guidelines

Use existing `*.test.ts`/`*.test.mjs` suites for affected behavior and the editor browser scripts for writing workflows. No numeric coverage threshold is configured. Verify production output and report warnings and unverified features precisely.

## Commit & Pull Request Guidelines

Use focused `feat:`, `fix:`, or `chore:` commits. PRs explain observable behavior, record checks, link relevant issues, and include screenshots for visual changes.

## Content, Security & Licensing

Markdown in Git is the authoritative article source; do not create Payload Posts. Library reads public Payload Works at build time using `PAYLOAD_URL`; a configured API failure must fail the build. Articles associate via `works` slug arrays. Reuse the existing card styles and filters. Keep provider credentials server-only. Preserve the root AGPL-3.0 license and upstream attribution. Record progress and migration boundaries in `docs/project-status.md`; do not alter production services without explicit authorization.
