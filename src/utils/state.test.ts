import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the logger so state's error/warn paths don't write to disk / stderr.
vi.mock("./logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock node:fs/promises before importing the module under test.
vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    copyFile: vi.fn(),
  },
}));

import fs from "node:fs/promises";
import type { PostMap } from "../types.js";
import { getPostState, isPublished, loadState, saveState, updatePostState } from "./state.js";

const mockedFs = vi.mocked(fs);

afterEach(() => {
  vi.clearAllMocks();
});

describe("updatePostState", () => {
  it("creates a new slug/platform entry", () => {
    const state: PostMap = {};
    updatePostState(state, "my-slug", "devto", "https://dev.to/x", "123", "hash1");
    expect(state["my-slug"].devto.url).toBe("https://dev.to/x");
    expect(state["my-slug"].devto.postId).toBe("123");
    expect(state["my-slug"].devto.contentHash).toBe("hash1");
    expect(state["my-slug"].devto.lastUpdated).toBeDefined();
  });

  it("preserves existing postId/contentHash when new values are omitted", () => {
    const state: PostMap = {
      "my-slug": {
        devto: { url: "old", postId: "123", contentHash: "hash1" },
      },
    };
    updatePostState(state, "my-slug", "devto", "https://dev.to/new");
    expect(state["my-slug"].devto.url).toBe("https://dev.to/new");
    expect(state["my-slug"].devto.postId).toBe("123");
    expect(state["my-slug"].devto.contentHash).toBe("hash1");
  });

  it("overwrites postId/contentHash when new values are provided", () => {
    const state: PostMap = {
      "my-slug": { devto: { url: "old", postId: "123", contentHash: "hash1" } },
    };
    updatePostState(state, "my-slug", "devto", "url", "456", "hash2");
    expect(state["my-slug"].devto.postId).toBe("456");
    expect(state["my-slug"].devto.contentHash).toBe("hash2");
  });
});

describe("isPublished", () => {
  it("returns true when a platform entry exists", () => {
    const state: PostMap = { s: { devto: { url: "u" } } };
    expect(isPublished(state, "s", "devto")).toBe(true);
  });

  it("returns false for an unknown slug or platform", () => {
    const state: PostMap = { s: { devto: { url: "u" } } };
    expect(isPublished(state, "s", "medium")).toBe(false);
    expect(isPublished(state, "other", "devto")).toBe(false);
  });
});

describe("getPostState", () => {
  it("returns the PostState when present", () => {
    const state: PostMap = { s: { devto: { url: "u", postId: "1" } } };
    expect(getPostState(state, "s", "devto")).toEqual({ url: "u", postId: "1" });
  });

  it("returns undefined when absent", () => {
    expect(getPostState({}, "s", "devto")).toBeUndefined();
  });
});

describe("loadState", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an empty object when the state file does not exist", async () => {
    const err = Object.assign(new Error("nope"), { code: "ENOENT" });
    mockedFs.readFile.mockRejectedValueOnce(err);
    expect(await loadState()).toEqual({});
  });

  it("parses a valid state file", async () => {
    const stored = { slug: { devto: { url: "https://dev.to/x", postId: "1" } } };
    mockedFs.readFile.mockResolvedValueOnce(JSON.stringify(stored) as never);
    expect(await loadState()).toEqual(stored);
  });

  it("migrates legacy string URLs into PostState objects", async () => {
    const legacy = { slug: { devto: "https://dev.to/legacy" } };
    mockedFs.readFile.mockResolvedValueOnce(JSON.stringify(legacy) as never);
    const state = await loadState();
    expect(state.slug.devto.url).toBe("https://dev.to/legacy");
    expect(state.slug.devto.lastUpdated).toBeDefined();
  });

  it("backs up and returns empty on a corrupted file", async () => {
    mockedFs.readFile.mockResolvedValueOnce("{ not valid json" as never);
    mockedFs.copyFile.mockResolvedValueOnce(undefined as never);
    const state = await loadState();
    expect(state).toEqual({});
    expect(mockedFs.copyFile).toHaveBeenCalled();
  });
});

describe("saveState", () => {
  it("writes pretty-printed JSON to the state file", async () => {
    mockedFs.writeFile.mockResolvedValueOnce(undefined as never);
    const state: PostMap = { s: { devto: { url: "u" } } };
    await saveState(state);
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      ".postmap.json",
      JSON.stringify(state, null, 2),
    );
  });
});
