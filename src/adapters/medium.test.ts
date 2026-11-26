import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("axios", () => ({
  default: { post: vi.fn(), isAxiosError: vi.fn(() => false) },
}));

import axios from "axios";
import type { Post } from "../types.js";
import { MediumAdapter } from "./medium.js";

const mockedAxios = vi.mocked(axios, true);

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    title: "Hello World",
    slug: "hello-world",
    content: "# Body",
    tags: ["tech", "ai"],
    frontmatter: {},
    publishedUrl: "https://origin.example.com/hello-world",
    ...overrides,
  };
}

const OLD_ENV = process.env;
beforeEach(() => {
  process.env = { ...OLD_ENV };
  process.env.MEDIUM_TOKEN = "token";
  process.env.MEDIUM_USER_ID = "user123";
});
afterEach(() => {
  process.env = OLD_ENV;
  vi.clearAllMocks();
});

describe("MediumAdapter.validate", () => {
  it("returns false when token or user id is missing", async () => {
    process.env.MEDIUM_USER_ID = undefined;
    expect(await new MediumAdapter().validate()).toBe(false);
  });

  it("returns true when both present", async () => {
    expect(await new MediumAdapter().validate()).toBe(true);
  });
});

describe("MediumAdapter.publish", () => {
  it("posts markdown to the user posts endpoint with a Bearer token", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { data: { url: "https://medium.com/@u/p", id: "m1" } },
    });
    await new MediumAdapter().publish(makePost());

    const [url, body, config] = mockedAxios.post.mock.calls[0];
    expect(url).toBe("https://api.medium.com/v1/users/user123/posts");
    expect((body as any).contentFormat).toBe("markdown");
    expect((config as any).headers.Authorization).toBe("Bearer token");
  });

  it("maps publishedUrl to canonicalUrl and sets public status", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { data: { url: "https://medium.com/@u/p", id: "m1" } },
    });
    await new MediumAdapter().publish(makePost());

    const body = mockedAxios.post.mock.calls[0][1] as any;
    expect(body.canonicalUrl).toBe("https://origin.example.com/hello-world");
    expect(body.publishStatus).toBe("public");
  });

  it("returns success with url and postId", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { data: { url: "https://medium.com/@u/p", id: "m1" } },
    });
    const result = await new MediumAdapter().publish(makePost());
    expect(result).toMatchObject({
      platform: "medium",
      success: true,
      url: "https://medium.com/@u/p",
      postId: "m1",
    });
  });

  it("returns failure with the error message on a non-axios error", async () => {
    mockedAxios.isAxiosError.mockReturnValueOnce(false as never);
    mockedAxios.post.mockRejectedValueOnce(new Error("boom"));
    const result = await new MediumAdapter().publish(makePost());
    expect(result.success).toBe(false);
    expect(result.error).toBe("boom");
  });
});
