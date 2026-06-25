import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashOpenAiNextApiKey, normalizeOpenAiNextApiKey } from "./apiKeyAuth.js";

describe("apiKeyAuth", () => {
  it("normalizes user-provided OpenAI Next API keys", () => {
    expect(normalizeOpenAiNextApiKey("  user-key  ")).toBe("user-key");
    expect(normalizeOpenAiNextApiKey("   ")).toBeUndefined();
    expect(normalizeOpenAiNextApiKey(undefined)).toBeUndefined();
  });

  it("hashes API keys for task ownership without storing the raw key", () => {
    const hash = hashOpenAiNextApiKey("user-key-a");

    expect(hash).toBe(createHash("sha256").update("user-key-a").digest("hex"));
    expect(hash).not.toContain("user-key-a");
  });
});
