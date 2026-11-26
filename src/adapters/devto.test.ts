import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("axios", () => ({
  default: { post: vi.fn(), put: vi.fn() },
}));

import axios from "axios";
import type { Post } from "../types.js";
import { DevToAdapter } from "./devto.js";

const mockedAxios = vi.mocked(axios, true);

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    title: "Hello World",
    slug: "hello-world",
    content: "# Body\n\nContent.",
    description: "desc",
    tags: ["Web Dev", "TypeScript!", "AI", "Node", "extra"],
    coverImage: "https://example.com/c.png",
    frontmatter: {},
    publishedUrl: "https://origin.example.com/hello-world",
    ...overrides,
  };
}

const OLD_ENV = process.env;
beforeEach(() => {
  process.env = { ...OLD_ENV };
});
afterEach(() => {
  process.env = OLD_ENV;
  vi.clearAllMocks();
});

describe("DevToAdapter.validate", () => {
  it("returns false when DEV_TO_API_KEY is missing", async () => {
    process.env.DEV_TO_API_KEY = undefined;
    expect(await new DevToAdapter().validate()).toBe(false);
  });

  it("returns true when DEV_TO_API_KEY is present", async () => {
    process.env.DEV_TO_API_KEY = "key";
    expect(await new DevToAdapter().validate()).toBe(true);
  });
});

describe("DevToAdapter.publish", () => {
  beforeEach(() => {
    process.env.DEV_TO_API_KEY = "key";
  });

  it("posts to the dev.to articles endpoint with the api-key header", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { url: "https://dev.to/u/hello-world", id: 42 },
    });
    await new DevToAdapter().publish(makePost());

    const [url, , config] = mockedAxios.post.mock.calls[0];
    expect(url).toBe("https://dev.to/api/articles");
    expect((config as any).headers["api-key"]).toBe("key");
  });

  it("maps publishedUrl to canonical_url and slugifies + caps tags at 4", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { url: "https://dev.to/u/hello-world", id: 42 },
    });
    await new DevToAdapter().publish(makePost());

    const body = mockedAxios.post.mock.calls[0][1] as any;
    expect(body.article.canonical_url).toBe("https://origin.example.com/hello-world");
    // tags lowercased, spaces + special chars removed, max 4
    expect(body.article.tags).toEqual(["webdev", "typescript", "ai", "node"]);
    expect(body.article.title).toBe("Hello World");
    expect(body.article.published).toBe(true);
  });

  it("returns a success result with url and stringified postId", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { url: "https://dev.to/u/hello-world", id: 42 },
    });
    const result = await new DevToAdapter().publish(makePost());
    expect(result).toMatchObject({
      platform: "devto",
      success: true,
      url: "https://dev.to/u/hello-world",
      postId: "42",
    });
  });

  it("returns a failure result surfacing the API error message", async () => {
    mockedAxios.post.mockRejectedValueOnce({
      response: { status: 422, data: { error: "Title already taken" } },
    });
    const result = await new DevToAdapter().publish(makePost());
    expect(result.success).toBe(false);
    expect(result.error).toBe("Title already taken");
  });

  it("retries on HTTP 429 then succeeds", async () => {
    vi.useFakeTimers();
    mockedAxios.post
      .mockRejectedValueOnce({
        response: { status: 429, headers: { "retry-after": "0" }, data: {} },
      })
      .mockResolvedValueOnce({ data: { url: "https://dev.to/u/x", id: 7 } });

    const promise = new DevToAdapter().publish(makePost());
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    vi.useRealTimers();
  });
});

describe("DevToAdapter.update", () => {
  beforeEach(() => {
    process.env.DEV_TO_API_KEY = "key";
  });

  it("PUTs to the article id endpoint and returns success", async () => {
    mockedAxios.put.mockResolvedValueOnce({
      data: { url: "https://dev.to/u/hello-world", id: 42 },
    });
    const result = await new DevToAdapter().update(makePost(), "42");
    const [url] = mockedAxios.put.mock.calls[0];
    expect(url).toBe("https://dev.to/api/articles/42");
    expect(result.success).toBe(true);
    expect(result.postId).toBe("42");
  });

  it("returns failure on error", async () => {
    mockedAxios.put.mockRejectedValueOnce({ message: "network down" });
    const result = await new DevToAdapter().update(makePost(), "42");
    expect(result.success).toBe(false);
    expect(result.error).toBe("network down");
  });
});
