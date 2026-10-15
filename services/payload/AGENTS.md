<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Backend Scope

This directory is an independent npm application. Keep the existing lockfile and verified providers. Works, Media, Users and Markdown Posts are registered; retain the old rich-text `posts` tables as history and use `cms_posts` for new articles. There are no visitor pages. Database schema push is disabled; review migrations and preserve old data. Bulk Markdown import defaults to dry-run and enables transactions only for explicit `--apply`. Never apply migrations or edit files in `../../legacy/`. Use disposable SQLite/media paths for tests. Local secrets, storage, and browser results are ignored.
