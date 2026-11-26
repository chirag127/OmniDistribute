import { describe, expect, it } from "vitest";
import { calculateHash } from "./hash.js";

describe("calculateHash", () => {
  it("returns a 32-char hex md5 digest", () => {
    const hash = calculateHash("hello world");
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("matches the known md5 of a fixed input", () => {
    // md5("hello world") is a stable, well-known value
    expect(calculateHash("hello world")).toBe("5eb63bbbe01eeed093cb22bb8f5acdc3");
  });

  it("is deterministic for the same input", () => {
    expect(calculateHash("some content")).toBe(calculateHash("some content"));
  });

  it("produces different digests for different content (change detection)", () => {
    expect(calculateHash("v1")).not.toBe(calculateHash("v2"));
  });

  it("handles empty string", () => {
    expect(calculateHash("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
  });
});
