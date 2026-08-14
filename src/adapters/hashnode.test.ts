import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("axios", () => ({
  default: { post: vi.fn() },
}));

import axios from "axios";
import type { Post } from "../types.js";
import { HashnodeAdapter } from "./hashnode.js";

const mockedAxios = vi.mocked(axios, true);

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    title: "Hello World",
    slug: "hello-world",
    content: "# Body",
    tags: ["Machine Learning", "AI/ML"],
    frontmatter: {},
    publishedUrl: "https://origin.example.com/hello-world",
    ...overrides,
  };
}

const OLD_ENV = process.env;
beforeEach(() => {
  process.env = { ...OLD_ENV };
  process.env.HASHNODE_TOKEN = "token";
  process.env.HASHNODE_PUBLICATION_ID = "pub123";
});
afterEach(() => {
  process.env = OLD_ENV;
  vi.clearAllMocks();
});

describe("HashnodeAdapter.validate", () => {
  it("returns false when token or publication id is missing", async () => {
    process.env.HASHNODE_TOKEN = undefined;
    expect(await new HashnodeAdapter().validate()).toBe(false);
  });

  it("returns true when both are present", async () => {
    expect(await new HashnodeAdapter().validate()).toBe(true);
  });
});

describe("HashnodeAdapter.publish", () => {
  it("sends a GraphQL mutation with Authorization header", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { data: { publishPost: { post: { url: "https://x.hashnode.dev/p", id: "id1" } } } },
    });
    await new HashnodeAdapter().publish(makePost());

    const [url, payload, config] = mockedAxios.post.mock.calls[0];
    expect(url).toBe("https://gql.hashnode.com");
    expect((payload as any).query).toContain("mutation PublishPost");
    expect((config as any).headers.Authorization).toBe("token");
  });

  it("maps publishedUrl to originalArticleURL and sets publicationId", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { data: { publishPost: { post: { url: "https://x.hashnode.dev/p", id: "id1" } } } },
    });
    await new HashnodeAdapter().publish(makePost());

    const input = (mockedAxios.post.mock.calls[0][1] as any).variables.input;
    expect(input.originalArticleURL).toBe("https://origin.example.com/hello-world");
    expect(input.publicationId).toBe("pub123");
  });

  it("slugifies tags: lowercase, non-alnum runs to hyphens, trimmed", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { data: { publishPost: { post: { url: "u", id: "id1" } } } },
    });
    await new HashnodeAdapter().publish(makePost());

    const input = (mockedAxios.post.mock.calls[0][1] as any).variables.input;
    expect(input.tags).toEqual([
      { name: "Machine Learning", slug: "machine-learning" },
      { name: "AI/ML", slug: "ai-ml" },
    ]);
  });

  it("returns success with url and postId", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { data: { publishPost: { post: { url: "https://x.hashnode.dev/p", id: "id1" } } } },
    });
    const result = await new HashnodeAdapter().publish(makePost());
    expect(result).toMatchObject({
      platform: "hashnode",
      success: true,
      url: "https://x.hashnode.dev/p",
      postId: "id1",
    });
  });

  it("surfaces a GraphQL error body as a failure", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { errors: [{ message: "Publication not found" }] },
    });
    const result = await new HashnodeAdapter().publish(makePost());
    expect(result.success).toBe(false);
    expect(result.error).toBe("Publication not found");
  });

  it("surfaces a network error as a failure", async () => {
    mockedAxios.post.mockRejectedValueOnce({ message: "ECONNRESET" });
    const result = await new HashnodeAdapter().publish(makePost());
    expect(result.success).toBe(false);
    expect(result.error).toBe("ECONNRESET");
  });
});

describe("HashnodeAdapter.update", () => {
  it("sends an UpdatePost mutation carrying the post id", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { data: { updatePost: { post: { url: "https://x.hashnode.dev/p", id: "id1" } } } },
    });
    const result = await new HashnodeAdapter().update(makePost(), "id1");
    const payload = mockedAxios.post.mock.calls[0][1] as any;
    expect(payload.query).toContain("mutation UpdatePost");
    expect(payload.variables.input.id).toBe("id1");
    expect(result.success).toBe(true);
  });
});
