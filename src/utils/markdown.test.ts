import { describe, expect, it } from "vitest";
import { extractExcerpt, markdownToHtml, parseMarkdown } from "./markdown.js";

describe("parseMarkdown", () => {
  it("parses frontmatter into a Post and strips it from content", () => {
    const md = `---
title: My Post
slug: my-post
description: A description
date: 2026-01-01
tags:
  - alpha
  - beta
cover_image: https://example.com/cover.png
---
# Heading

Body text here.`;

    const post = parseMarkdown(md);
    expect(post.title).toBe("My Post");
    expect(post.slug).toBe("my-post");
    expect(post.description).toBe("A description");
    expect(post.tags).toEqual(["alpha", "beta"]);
    expect(post.coverImage).toBe("https://example.com/cover.png");
    // frontmatter must be stripped from the body content
    expect(post.content).not.toContain("title: My Post");
    expect(post.content).toContain("# Heading");
    expect(post.content).toContain("Body text here.");
  });

  it("maps cover_image (snake_case frontmatter) to coverImage", () => {
    const post = parseMarkdown("---\ncover_image: /x.png\n---\nbody");
    expect(post.coverImage).toBe("/x.png");
  });

  it("defaults title to 'Untitled' when absent", () => {
    const post = parseMarkdown("---\nslug: no-title\n---\nbody");
    expect(post.title).toBe("Untitled");
  });

  it("defaults tags to an empty array when absent", () => {
    const post = parseMarkdown("---\ntitle: X\n---\nbody");
    expect(post.tags).toEqual([]);
  });

  it("leaves slug undefined when absent (caller fills default)", () => {
    const post = parseMarkdown("---\ntitle: X\n---\nbody");
    expect(post.slug).toBeUndefined();
  });

  it("exposes the raw frontmatter object", () => {
    const post = parseMarkdown("---\ntitle: X\ncustom: value\n---\nbody");
    expect(post.frontmatter.custom).toBe("value");
    expect(post.frontmatter.title).toBe("X");
  });

  it("handles content with no frontmatter", () => {
    const post = parseMarkdown("just body, no frontmatter");
    expect(post.title).toBe("Untitled");
    expect(post.content.trim()).toBe("just body, no frontmatter");
  });
});

describe("markdownToHtml", () => {
  it("renders headings and paragraphs to HTML", () => {
    const html = markdownToHtml("# Title\n\nSome **bold** text.");
    expect(html).toContain("<h1");
    expect(html).toContain("Title");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("renders links", () => {
    const html = markdownToHtml("[click](https://example.com)");
    expect(html).toContain('href="https://example.com"');
  });
});

describe("extractExcerpt", () => {
  it("strips markdown formatting characters", () => {
    const excerpt = extractExcerpt("# Heading with `code` and *emph* and [link]");
    expect(excerpt).not.toMatch(/[#*`[\]]/);
    expect(excerpt).toContain("Heading with code");
  });

  it("collapses newlines into spaces", () => {
    const excerpt = extractExcerpt("line one\nline two");
    expect(excerpt).toBe("line one line two");
  });

  it("returns the full text when shorter than the limit", () => {
    expect(extractExcerpt("short", 160)).toBe("short");
  });

  it("truncates and appends an ellipsis when over the limit", () => {
    const long = "a".repeat(200);
    const excerpt = extractExcerpt(long, 50);
    expect(excerpt.endsWith("...")).toBe(true);
    expect(excerpt).toBe(`${"a".repeat(50)}...`);
  });

  it("respects a custom length argument", () => {
    const excerpt = extractExcerpt("abcdefghij", 5);
    expect(excerpt).toBe("abcde...");
  });
});
