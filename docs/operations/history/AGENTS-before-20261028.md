> 历史快照：2026-10-28清理前入口原文，不作为当前运行指令。

# Repository Guidelines

## Current Authorized Development Environment

The user explicitly approved server-side development for the unified Markdown-library workflow. Website changes belong to this existing Git repository. A worktree is a working directory for its development branch, not a separate website project; the deployed checkout must stay compatible with its running database and publisher until a coordinated release. This authorization supersedes older WSL-only development text below for this task. Use disposable SQLite/media/config for tests; do not migrate production data, restart production services, publish content, read/copy credentials or switch the production checkout as part of development. Shared dependency directories may be reused read-only; do not install into or mutate production node_modules. Cross-project contract is `/home/trace/projects/WORKFLOW.md`.

## Project Structure & Module Organization

The repository root retains Astro Koharu's structure. Routes live in `src/pages/`, blog Markdown in `src/content/blog/`, components in `src/components/`, shared logic in `src/lib/`, and assets in `public/` and `src/assets/`. Tests are in `tests/` and colocated `*.test.ts` files. Site settings live in `config/site.yaml`.

`cms/` is Koharu's local Markdown editor. `services/payload/` is the independent Payload Admin/API for Works, Posts, Media, Users and API-key-only ContentClients. It retains its npm lockfile; run its commands inside that directory. `legacy/` contains complete local reference repositories, excluded from Git, checks, builds, and deployment. Preserve their files, databases, credentials, and uncommitted changes.

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

## Development and Deployment Boundary

The agent handles local development, tests and delivery; the user handles server operations. Provide reviewed changes, validation results and actionable server instructions for the user to execute. Do not initiate server connections or request server credentials, SSH identities or connection details.

Treat WSL SQLite and uploads as an independent development/test dataset; the server database and uploads hold production content. Git carries source and reviewed migration scripts. Dataset transfers are separate operations requiring an explicit request; keep runtime data and credentials private. Local tests explicitly select a loopback origin and local test credentials.

Implement subsequent source changes in the user's WSL checkout, commit and push there, then deploy reviewed commits to the server. `/home/trace/projects/homepage` is now the production checkout; do not continue feature development there without explicit authorization. Server-side operational data, secrets, certificates and generated releases stay outside Git. Source templates for the existing deployment live in `deploy/server/` and are installed separately into `/home/trace/projects/homepage-deployment/`; do not run them in-place or blindly overwrite the live directory.

See `docs/development-handoff.md` for agreed but unimplemented product designs. Straightforward fixes using existing behavior may proceed within task authorization; new business fields, schema migrations, services, business-rule changes or data rewrites require a concrete plan and user approval. Preserve personal notes, ratings, status and experience dates.

## Content, Security & Licensing

Select exactly one article source with `CONTENT_SOURCE`: `files` uses Git Markdown, while `payload` uses Posts and ignored build inputs under `.cache/payload-posts/`. Switching production requires the reviewed import and deployment procedure in `docs/posts-deployment.md`; do not merge both article sources or edit generated files. Works select one Posts relationship; `works` frontmatter is only a files-mode migration compatibility path. Protected article source is restricted to authorized administrators/content clients and the private read-only build endpoint. Unified tools use the standard Payload REST API with a dedicated `content-clients` API key, never administrator credentials or the build token; see `docs/content-tools.md` and `skills/homepage-content/SKILL.md`. Content clients cannot administer identities, upload media or deploy. Keep credentials server-side/private, outside Git and logs. Reuse the existing card styles and filters. Preserve the root AGPL-3.0 license and upstream attribution. Record validation in `docs/project-status.md`; do not alter production services without explicit authorization.
