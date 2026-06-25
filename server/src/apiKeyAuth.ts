import { createHash } from "node:crypto";
import type express from "express";

export const openAiNextApiKeyHeader = "x-openai-next-key";

export function normalizeOpenAiNextApiKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readOpenAiNextApiKey(request: express.Request): string | undefined {
  return normalizeOpenAiNextApiKey(request.get(openAiNextApiKeyHeader));
}

export function hashOpenAiNextApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey.trim()).digest("hex");
}
