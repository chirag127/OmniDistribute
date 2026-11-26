import { describe, expect, it, vi } from "vitest";
import { retry } from "./retry.js";

describe("retry", () => {
  it("returns the result on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retry(fn, { minTimeout: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and eventually succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("recovered");

    const result = await retry(fn, { minTimeout: 1, maxTimeout: 2 });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(retry(fn, { retries: 2, minTimeout: 1, maxTimeout: 2 })).rejects.toThrow(
      "always fails",
    );
    // initial attempt + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("invokes the onRetry callback with error and attempt number", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue("done");

    await retry(fn, { minTimeout: 1, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  it("respects the configured retry count", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("nope"));
    await expect(retry(fn, { retries: 0, minTimeout: 1 })).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
