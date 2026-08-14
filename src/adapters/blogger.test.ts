import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Capture the requestBody passed to blogger.posts.insert/update.
const insertMock = vi.fn();
const updateMock = vi.fn();
const setCredentials = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials = setCredentials;
      },
    },
    blogger: () => ({
      posts: { insert: insertMock, update: updateMock },
    }),
  },
}));

import type { Post } from "../types.js";
import { BloggerAdapter } from "./blogger.js";

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    title: "Hello World",
    slug: "hello-world",
    content: "# Heading\n\nSome **bold** body.",
    tags: ["tech", "ai"],
    frontmatter: {},
    ...overrides,
  };
}

const OLD_ENV = process.env;
beforeEach(() => {
  process.env = { ...OLD_ENV };
  process.env.BLOGGER_CLIENT_ID = "cid";
  process.env.BLOGGER_CLIENT_SECRET = "secret";
  process.env.BLOGGER_REFRESH_TOKEN = "refresh";
  process.env.BLOGGER_BLOG_ID = "blog1";
  // Blogger publish sleeps 5s to avoid rate limits — skip real waiting.
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  process.env = OLD_ENV;
  vi.clearAllMocks();
});

async function runPublish(post: Post) {
  insertMock.mockResolvedValueOnce({ data: { url: "https://blog/p", id: "b1" } });
  const promise = new BloggerAdapter().publish(post);
  await vi.runAllTimersAsync();
  return promise;
}

describe("BloggerAdapter.validate", () => {
  it("returns false when any required env var is missing", async () => {
    process.env.BLOGGER_BLOG_ID = undefined;
    expect(await new BloggerAdapter().validate()).toBe(false);
  });

  it("returns true when all env vars present", async () => {
    expect(await new BloggerAdapter().validate()).toBe(true);
  });
});

describe("BloggerAdapter.publish — markdown + canonical transform", () => {
  it("converts markdown content to HTML", async () => {
    await runPublish(makePost());
    const body = insertMock.mock.calls[0][0].requestBody;
    expect(body.content).toContain("<h1");
    expect(body.content).toContain("<strong>bold</strong>");
  });

  it("does NOT inject a canonical link when canonicalUrl is absent", async () => {
    await runPublish(makePost({ canonicalUrl: undefined }));
    const body = insertMock.mock.calls[0][0].requestBody;
    expect(body.content).not.toContain('rel="canonical"');
    expect(body.content).not.toContain("Originally published at");
  });

  it("injects rel=canonical link + visible source when canonicalUrl is set (blog-network mode)", async () => {
    const canonical = "https://oriz.in/blog/hello-world";
    await runPublish(makePost({ canonicalUrl: canonical }));
    const body = insertMock.mock.calls[0][0].requestBody;
    expect(body.content).toContain(`<link rel="canonical" href="${canonical}" />`);
    expect(body.content).toContain(`Originally published at`);
    expect(body.content).toContain(canonical);
  });

  it("passes tags as Blogger labels and returns success", async () => {
    const result = await runPublish(makePost());
    const body = insertMock.mock.calls[0][0].requestBody;
    expect(body.labels).toEqual(["tech", "ai"]);
    expect(result).toMatchObject({
      platform: "blogger",
      success: true,
      url: "https://blog/p",
      postId: "b1",
    });
  });

  it("returns failure when the Blogger API throws", async () => {
    insertMock.mockRejectedValueOnce(new Error("quota exceeded"));
    const promise = new BloggerAdapter().publish(makePost());
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe("quota exceeded");
  });
});
