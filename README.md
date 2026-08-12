# OmniDistribute

[![GitHub Stars](https://img.shields.io/github/stars/chirag127/OmniDistribute?style=flat-square&logo=github)](https://github.com/chirag127/OmniDistribute/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-green?style=flat-square&logo=nodedotjs)](https://nodejs.org/)

Resilient, idempotent, multi-channel content distribution engine in TypeScript. Write a Markdown article once; publish it to 30+ platforms and generate a fast static blog from the same source.

**Live site:** https://omnidistribute.oriz.in

Star this repo if it helps.

## What it does

- **Single-source Markdown** in `content/posts/` is the one source of truth.
- **Fan-out publish** to 30+ platform adapters (`src/adapters/`): Dev.to, Hashnode, Medium, Blogger, WordPress, Ghost, Notion, Reddit, Bluesky, Mastodon, Threads, Twitter/X, LinkedIn, Telegram, Discord, GitLab, Bitbucket, Codeberg, Gist, Telegraph, Tumblr, VK, Weibo, Plurk, Pixnet, LiveJournal, Neocities, Wix, Strapi, EdgeOne, Pastebin, Showwcase.
- **Idempotent** — a per-post state map (`.postmap.json`) prevents duplicate posts across runs.
- **Resilient** — retry with backoff (`src/utils/retry.ts`) on network/API failure.
- **Static blog** built with Hugo (PaperMod theme).

## Stack

TypeScript, `tsx` runtime, Hugo static site, Biome (lint/format), Winston logging. Node >= 22, pnpm.

## Getting started

```bash
git clone https://github.com/chirag127/OmniDistribute.git
cd OmniDistribute
pnpm install
cp .env.example .env   # fill in platform API keys (each documented in .env.example)
```

## Usage

```bash
pnpm verify-env      # check which platform credentials are set
pnpm seed            # seed sample content
pnpm start           # publish content/posts/ to all configured platforms
pnpm deploy          # build static site (hugo --minify)
pnpm verify-links    # validate published links
```

Only platforms whose credentials are present in `.env` are targeted; the rest are skipped. Re-running is safe — already-published posts are recorded in `.postmap.json` and not re-posted.

## Blog-network mode

Ingest the oriz.in blog network — 24 sibling Astro blogs at `../oriz-blog-<niche>/` (each deploys to `<niche>-blog.oriz.in`) — instead of `content/posts/`:

```bash
pnpm start -- --source=astro-blogs      # or SOURCE=astro-blogs pnpm start
```

- **Scan** — reads `../oriz-blog-*/src/content/blog/*.{md,mdx}` (root overridable via `BLOG_NETWORK_ROOT`). Missing/empty/draft repos are skipped silently, so it is safe while blogs are still being created.
- **Canonical** — every cross-post sets `canonical_url` back to the origin `https://<niche>-blog.oriz.in/blog/<slug>/`, so the oriz.in blog keeps SEO credit. Blogger (no native canonical field) gets an injected `<link rel="canonical">` + source link.
- **Per-niche routing** — `tech`/`ai`/`business`/`marketing`/`remote-work` → dev.to + Hashnode + Medium + Blogger; all other niches → Blogger + Medium + Telegraph + Mastodon + Bluesky + Telegram. Override per niche with `BLOG_ROUTE_<NICHE>=devto,medium,...` (e.g. `BLOG_ROUTE_REMOTE_WORK`). Config map lives in `src/sources/astro-blogs.ts`.
- **Idempotent** — state key is `<niche>/<slug>` (1:1 with the canonical URL) so identical slugs across blogs never collide in `.postmap.json`.

The default `content/posts/` source is unchanged.

## Adding a platform

Add `src/adapters/<name>.ts` implementing the adapter interface in `src/types.ts`, wire it into `src/publish.ts`, and document its env var in `.env.example`.

## License

[MIT](./LICENSE) © Chirag Singhal
