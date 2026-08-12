import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { Post } from "../types.js";
import { logger } from "../utils/logger.js";

/**
 * Blog-network ingest source.
 *
 * Scans the sibling `oriz-blog-<niche>/` Astro repos for `src/content/blog/*.{md,mdx}`,
 * parses their frontmatter, and yields {@link Post} objects whose canonical URL points
 * back at the origin oriz.in blog (`https://<niche>-blog.oriz.in/blog/<slug>/`).
 *
 * Repos still being scaffolded (missing dir / empty collection) are skipped silently.
 */

/** Per-niche adapter routing. Names must match `Adapter.name`. */
const NICHE_ROUTING: Record<string, string[]> = {
  // Dev/tech-leaning niches: full long-form syndication.
  tech: ["devto", "hashnode", "medium", "blogger"],
  ai: ["devto", "hashnode", "medium", "blogger"],
  business: ["devto", "hashnode", "medium", "blogger"],
  marketing: ["devto", "hashnode", "medium", "blogger"],
  "remote-work": ["devto", "hashnode", "medium", "blogger"],
};

/** Everything else: blogger + medium + telegraph + relevant socials. */
const DEFAULT_ROUTING = ["blogger", "medium", "telegraph", "mastodon", "bluesky", "telegram"];

const SLUG_RE = /^oriz-blog-(.+)$/;
const CODE_FENCE_RE = /^\s*(```|~~~)/;
const MDX_STATEMENT_RE = /^\s*(import|export)\s.+$/;

function routingFor(niche: string): string[] {
  const envKey = `BLOG_ROUTE_${niche.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const override = process.env[envKey];
  if (override) {
    return override
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return NICHE_ROUTING[niche] ?? DEFAULT_ROUTING;
}

/**
 * Downgrade MDX to plain markdown: drop top-level `import`/`export` statements
 * that live outside fenced code blocks. Component JSX is left as-is (rare, and
 * only ever appears inside code samples in these blogs).
 */
function mdxToMarkdown(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (CODE_FENCE_RE.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (!inFence && MDX_STATEMENT_RE.test(line)) {
      continue;
    }
    out.push(line);
  }
  return out.join("\n").trim();
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/** Root that holds the `oriz-blog-*` repos. Override with `BLOG_NETWORK_ROOT`. */
function networkRoot(): string {
  if (process.env.BLOG_NETWORK_ROOT) return process.env.BLOG_NETWORK_ROOT;
  // This repo lives at <ws>/repos/own/omnidistribute; siblings share its parent.
  return path.resolve(process.cwd(), "..");
}

export async function getAstroBlogPosts(): Promise<Post[]> {
  const root = networkRoot();
  if (!(await dirExists(root))) {
    logger.warn(`Blog-network root not found: ${root}. No posts ingested.`);
    return [];
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  const blogDirs = entries
    .filter((e) => e.isDirectory() && SLUG_RE.test(e.name))
    .map((e) => e.name)
    .sort();

  const posts: Post[] = [];

  for (const dirName of blogDirs) {
    const niche = dirName.match(SLUG_RE)?.[1];
    if (!niche) continue;

    const contentDir = path.join(root, dirName, "src", "content", "blog");
    if (!(await dirExists(contentDir))) {
      logger.info(`Skipping ${dirName}: no content/blog dir yet.`);
      continue;
    }

    const files = (await fs.readdir(contentDir)).filter(
      (f) => f.endsWith(".mdx") || f.endsWith(".md"),
    );
    if (files.length === 0) {
      logger.info(`Skipping ${dirName}: empty blog collection.`);
      continue;
    }

    const platforms = routingFor(niche);

    for (const file of files) {
      try {
        const raw = await fs.readFile(path.join(contentDir, file), "utf-8");
        const { data, content } = matter(raw);

        if (data.draft === true) continue;

        const slug: string = data.slug || file.replace(/\.(mdx|md)$/, "");
        const canonicalUrl = `https://${niche}-blog.oriz.in/blog/${slug}/`;

        const tags: string[] = Array.isArray(data.tags)
          ? data.tags.map(String)
          : typeof data.tags === "string"
            ? data.tags
                .split(",")
                .map((t: string) => t.trim())
                .filter(Boolean)
            : [];

        const pubDate = data.pubDate ?? data.date;

        posts.push({
          title: data.title || slug,
          // Namespace the state key by niche so identical slugs across blogs
          // never collide in `.postmap.json` (keyed 1:1 with canonical URL).
          slug: `${niche}/${slug}`,
          content: mdxToMarkdown(content),
          description: data.description,
          date: pubDate ? new Date(pubDate).toISOString() : undefined,
          tags,
          coverImage: data.heroImage || data.coverImage,
          frontmatter: data,
          canonicalUrl,
          publishedUrl: canonicalUrl, // adapters read publishedUrl for canonical/link
          platforms,
        });
      } catch (error) {
        logger.warn(`Failed to parse ${dirName}/${file}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  logger.info(`Blog-network: ingested ${posts.length} posts from ${blogDirs.length} repos.`);
  return posts;
}
