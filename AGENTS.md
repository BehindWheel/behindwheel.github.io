<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Branches & PRs

- Work always happens on a fresh branch cut from the latest `main` — fetch first (`git fetch origin main && git checkout -b <name> origin/main`); never commit to `main` directly.
- A PR merges only after approval, via rebase — no merge commits, the history stays linear.
- A PR title and description are always in English, no matter what language the chat or the UI strings use — the repo is public and the history is the documentation.

## Merges

- CI must be green on the PR head before merging.
- Force-push is allowed in this repo — it's the tool for rebasing an open PR onto a moved `main`. Always with `--force-with-lease`, never bare `--force`; a rebase that resolves conflicts is preferable to merging `main` into the branch.
- The agent may rebase-merge small, green PRs on its own, but asks specifically about each one — always interactively (a question the user answers in the chat, not a statement they have to reply to), and re-checks the live PR state (`gh pr list`/`gh pr view`) immediately before asking, not from memory.
- Merge questions cover only PRs tied to the current work — don't bundle unrelated open PRs into them unless the user explicitly asks.
- Every push to `main` triggers a Pages deploy; the deploy workflow has `concurrency: cancel-in-progress`, so merging several PRs in a row is safe — the last build wins.
