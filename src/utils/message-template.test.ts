import { describe, expect, it } from "vitest";
import type { Post } from "../types.js";
import { formatSocialPost } from "./message-template.js";

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    title: "My Blog Post Title",
    slug: "my-blog-post",
    content: "This is the body content of the blog post that will become the excerpt.",
    tags: ["tech", "typescript", "automation"],
    frontmatter: {},
    publishedUrl: "https://blog.example.com/my-blog-post",
    ...overrides,
  };
}

describe("formatSocialPost", () => {
  it("includes the full URL (the CRITICAL never-truncated invariant)", () => {
    const url = "https://blog.example.com/some/very/long/path/to/an/article-with-a-long-slug";
    const { message } = formatSocialPost(makePost({ publishedUrl: url }), 500);
    expect(message).toContain(url);
  });

  it("keeps the URL intact even when maxLength is very small", () => {
    const url = "https://blog.example.com/my-blog-post";
    const { message } = formatSocialPost(makePost({ publishedUrl: url }), 60);
    expect(message).toContain(url);
  });

  it("never exceeds maxLength", () => {
    const { message } = formatSocialPost(makePost(), 500);
    expect(message.length).toBeLessThanOrEqual(500);
  });

  it("respects a tight maxLength for a long title/content", () => {
    const post = makePost({
      title: "A".repeat(300),
      content: "B".repeat(2000),
    });
    const { message } = formatSocialPost(post, 280);
    expect(message.length).toBeLessThanOrEqual(280);
    // URL is the load-bearing element and must still survive
    expect(message).toContain(post.publishedUrl!);
  });

  it("formats hashtags from tags, stripping spaces, limited to 3", () => {
    const post = makePost({ tags: ["machine learning", "ai", "data", "extra", "fifth"] });
    const { hashtags } = formatSocialPost(post, 500);
    // spaces removed within a tag
    expect(hashtags).toContain("#machinelearning");
    // limited to first 3 tags
    expect(hashtags).toBe("#machinelearning #ai #data");
  });

  it("returns empty hashtags when there are no tags", () => {
    const { hashtags } = formatSocialPost(makePost({ tags: [] }), 500);
    expect(hashtags).toBe("");
  });

  it("omits the 'Read more' section when publishedUrl is absent", () => {
    const { message } = formatSocialPost(makePost({ publishedUrl: undefined }), 500);
    expect(message).not.toContain("Read more:");
  });

  it("includes the title prefix and title for a normal post", () => {
    const { message } = formatSocialPost(makePost(), 500);
    expect(message).toContain("New Blog Post");
  });

  it("produces an excerpt derived from the content with markdown stripped", () => {
    const post = makePost({ content: "# Heading\n\nSome *rich* `content` here." });
    const { excerpt } = formatSocialPost(post, 500);
    expect(excerpt).not.toMatch(/[#*`_~[\]]/);
  });
});
