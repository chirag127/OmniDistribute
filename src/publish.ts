import dotenv from "dotenv";

// Load environment variables BEFORE any other imports that might use them
dotenv.config();

import fs from "node:fs/promises";
import path from "node:path";
import { BitbucketAdapter } from "./adapters/bitbucket.js";
import { BloggerAdapter } from "./adapters/blogger.js";
import { BlueskyAdapter } from "./adapters/bluesky.js";
import { CodebergAdapter } from "./adapters/codeberg.js";
// Import Adapters
import { DevToAdapter } from "./adapters/devto.js";
import { DiscordAdapter } from "./adapters/discord.js";
import { EdgeOneAdapter } from "./adapters/edgeone.js";
import { FacebookAdapter } from "./adapters/facebook.js";
import { GistAdapter } from "./adapters/gist.js";
import { GitLabAdapter } from "./adapters/gitlab.js";
import { HashnodeAdapter } from "./adapters/hashnode.js";
import { LinkedInAdapter } from "./adapters/linkedin.js";
import { LiveJournalAdapter } from "./adapters/livejournal.js";
import { MastodonAdapter } from "./adapters/mastodon.js";
import { MediumAdapter } from "./adapters/medium.js";
import { NeocitiesAdapter } from "./adapters/neocities.js";
import { NotionAdapter } from "./adapters/notion.js";
import { PastebinAdapter } from "./adapters/pastebin.js";
import { PixnetAdapter } from "./adapters/pixnet.js";
import { PlurkAdapter } from "./adapters/plurk.js";
import { RedditAdapter } from "./adapters/reddit.js";
import { ShowwcaseAdapter } from "./adapters/showwcase.js";
import { StrapiAdapter } from "./adapters/strapi.js";
// Social Media Link Sharing Adapters
import { TelegramAdapter } from "./adapters/telegram.js";
import { TelegraphAdapter } from "./adapters/telegraph.js";
import { ThreadsAdapter } from "./adapters/threads.js";
import { TumblrAdapter } from "./adapters/tumblr.js";
import { TwitterAdapter } from "./adapters/twitter.js";
import { VKAdapter } from "./adapters/vk.js";
import { WeiboAdapter } from "./adapters/weibo.js";
import { WixAdapter } from "./adapters/wix.js";
import { WordPressAdapter } from "./adapters/wordpress.js";
import { getAstroBlogPosts } from "./sources/astro-blogs.js";
import type { Adapter, Post, PublishResult } from "./types.js";
import { calculateHash } from "./utils/hash.js";
import { logger, logPublishFailure, logPublishSuccess } from "./utils/logger.js";
import { parseMarkdown } from "./utils/markdown.js";
import { getPostState, loadState, saveState, updatePostState } from "./utils/state.js";

const ADAPTERS: Adapter[] = [
  new DevToAdapter(),
  new HashnodeAdapter(),
  new MediumAdapter(),
  new WordPressAdapter(),
  new BloggerAdapter(),
  new TumblrAdapter(),
  new WixAdapter(),
  new TelegraphAdapter(),
  new MastodonAdapter(),
  new NotionAdapter(),
  new StrapiAdapter(),
  new LinkedInAdapter(),
  new RedditAdapter(),
  new DiscordAdapter(),
  new ShowwcaseAdapter(),

  new LiveJournalAdapter(),
  new VKAdapter(),
  new WeiboAdapter(),
  new PixnetAdapter(),
  new PlurkAdapter(),
  new GitLabAdapter(),
  new BitbucketAdapter(),
  new NeocitiesAdapter(),
  new CodebergAdapter(),
  new GistAdapter(),
  new PastebinAdapter(),
  new EdgeOneAdapter(),
  // Social Media Link Sharing Adapters
  new TelegramAdapter(),
  new BlueskyAdapter(),
  new TwitterAdapter(),
  new ThreadsAdapter(),
  new FacebookAdapter(),
];

async function getPosts(postsDir: string): Promise<Post[]> {
  const files = await fs.readdir(postsDir);
  const posts: Post[] = [];

  for (const file of files) {
    if (file.endsWith(".md")) {
      const content = await fs.readFile(path.join(postsDir, file), "utf-8");
      const post = parseMarkdown(content);
      // Ensure slug is present, default to filename without extension
      if (!post.slug) {
        post.slug = file.replace(".md", "");
      }
      posts.push(post);
    }
  }
  return posts;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force"); // Re-publish even if already published

  const sourceArg = args.find((a) => a.startsWith("--source="))?.split("=")[1];
  const source = sourceArg || process.env.SOURCE || "posts";

  logger.info("Starting Omni-Publisher...", { dryRun, force, source });

  let posts: Post[];
  if (source === "astro-blogs") {
    posts = await getAstroBlogPosts();
  } else {
    const postsDir = path.join(process.cwd(), "content", "posts");
    posts = await getPosts(postsDir);
  }
  const state = await loadState();

  // Filter enabled adapters
  const enabledAdapters: Adapter[] = [];
  for (const adapter of ADAPTERS) {
    // Check for explicit disable via env var (e.g. ENABLE_TWITTER=false)
    const envVarName = `ENABLE_${adapter.name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    const isEnvDisabled = process.env[envVarName] === "false";

    if (isEnvDisabled) {
      // Silently skip disabled adapters
      continue;
    }

    if (adapter.enabled && (await adapter.validate())) {
      enabledAdapters.push(adapter);
    } else {
      logger.warn(`Adapter ${adapter.name} is disabled or invalid configuration`);
    }
  }

  if (enabledAdapters.length === 0) {
    logger.error("No enabled adapters found. Exiting.");
    return;
  }

  logger.info(`Found ${posts.length} posts and ${enabledAdapters.length} enabled adapters.`);

  for (const post of posts) {
    if (!post.slug) continue; // Should be handled in getPosts but safety check

    logger.info(`Processing post: ${post.title} (${post.slug})`);

    // Per-post platform routing (blog-network mode). undefined = all enabled.
    const postAdapters = post.platforms
      ? enabledAdapters.filter((a) => post.platforms!.includes(a.name))
      : enabledAdapters;
    if (post.platforms && postAdapters.length === 0) {
      logger.warn(`No enabled adapters match routing for ${post.slug}; skipping.`);
      continue;
    }

    // STEP 1: Publish to Blogger FIRST (primary platform)
    const bloggerAdapter = postAdapters.find((a) => a.name === "blogger");
    const contentHash = calculateHash(post.content);

    if (bloggerAdapter && !dryRun) {
      const currentState = getPostState(state, post.slug!, "blogger");

      if (!force && currentState) {
        // Check for updates
        if (
          currentState.contentHash !== contentHash &&
          bloggerAdapter.update &&
          currentState.postId
        ) {
          logger.info(`Updating post ${post.slug} on Blogger...`);
          try {
            const result = await bloggerAdapter.update(post, currentState.postId);
            if (result.success) {
              logPublishSuccess("blogger", post.slug!, result.url || currentState.url);
              updatePostState(
                state,
                post.slug!,
                "blogger",
                result.url || currentState.url,
                result.postId,
                contentHash,
              );
              post.publishedUrl = result.url || currentState.url;
              await saveState(state);
            } else {
              logPublishFailure("blogger", post.slug!, result.error);
              if (!post.canonicalUrl) post.publishedUrl = currentState.url; // Fallback to existing URL
            }
          } catch (error: any) {
            logPublishFailure("blogger", post.slug!, error);
            if (!post.canonicalUrl) post.publishedUrl = currentState.url;
          }
        } else {
          logger.info(`Post ${post.slug} already up-to-date on Blogger, using existing URL`);
          if (!post.canonicalUrl) post.publishedUrl = currentState.url;
        }
      } else {
        logger.info(`Publishing to Blogger first...`);
        try {
          const bloggerResult = await bloggerAdapter.publish(post);
          if (bloggerResult.success && bloggerResult.url) {
            // Preserve origin canonical (blog-network mode) — Blogger is a
            // cross-post there, not the origin, so keep SEO credit on oriz.in.
            if (!post.canonicalUrl) {
              post.publishedUrl = bloggerResult.url;
            }
            logPublishSuccess("blogger", post.slug!, bloggerResult.url);
            updatePostState(
              state,
              post.slug!,
              "blogger",
              bloggerResult.url,
              bloggerResult.postId,
              contentHash,
            );
            await saveState(state); // Save immediately after Blogger
            logger.info(`✅ Blogger URL obtained: ${bloggerResult.url}`);
          } else {
            logPublishFailure("blogger", post.slug!, bloggerResult.error);
            logger.warn(
              `⚠️ Blogger publishing failed. Social media adapters will not have a link to share.`,
            );
          }
        } catch (error: any) {
          logPublishFailure("blogger", post.slug!, error);
          logger.warn(
            `⚠️ Blogger publishing failed. Social media adapters will not have a link to share.`,
          );
        }
      }
    }

    // STEP 2: Publish to all OTHER adapters (in parallel) with Blogger URL available
    const otherAdapters = postAdapters.filter((a) => a.name !== "blogger");

    const publishPromises = otherAdapters.map(async (adapter) => {
      const currentState = getPostState(state, post.slug!, adapter.name);

      // Check if already published
      if (!force && currentState) {
        // Check for updates
        if (currentState.contentHash !== contentHash && adapter.update && currentState.postId) {
          logger.info(`Updating post ${post.slug} on ${adapter.name}...`);
          try {
            const result = await adapter.update?.(post, currentState.postId);

            if (result.success) {
              logPublishSuccess(adapter.name, post.slug!, result.url || currentState.url);
              updatePostState(
                state,
                post.slug!,
                adapter.name,
                result.url || currentState.url,
                result.postId,
                contentHash,
              );
            } else {
              logPublishFailure(adapter.name, post.slug!, result.error);
            }
            return result;
          } catch (error: any) {
            logPublishFailure(adapter.name, post.slug!, error);
            return {
              platform: adapter.name,
              success: false,
              error: error.message,
            };
          }
        } else {
          logger.info(`Skipping ${post.slug} on ${adapter.name} (already up-to-date)`);
          return {
            platform: adapter.name,
            success: true,
            skipped: true,
          } as PublishResult;
        }
      }

      // Publish New
      try {
        const result = await adapter.publish(post);

        if (result.success) {
          logPublishSuccess(adapter.name, post.slug!, result.url || "");
          updatePostState(
            state,
            post.slug!,
            adapter.name,
            result.url || "",
            result.postId,
            contentHash,
          );
        } else {
          logPublishFailure(adapter.name, post.slug!, result.error);
        }
        return result;
      } catch (error: any) {
        logPublishFailure(adapter.name, post.slug!, error);
        return {
          platform: adapter.name,
          success: false,
          error: error.message,
        };
      }
    });

    await Promise.allSettled(publishPromises);

    // Save state after each post to avoid data loss on crash
    if (!dryRun) {
      await saveState(state);
    }
  }

  logger.info("Publishing complete.");
}

main().catch((error) => {
  logger.error("Fatal error in main loop", { error });
  process.exit(1);
});
