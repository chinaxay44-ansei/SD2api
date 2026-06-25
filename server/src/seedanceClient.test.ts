import { afterEach, describe, expect, it, vi } from "vitest";
import { createSeedanceTask, getSeedanceTask } from "./seedanceClient.js";
import type { SeedancePayload } from "./types.js";

const payload: SeedancePayload = {
  model: "doubao-seedance-2-0-260128",
  content: [{ type: "text", text: "A five second video." }],
  resolution: "480p",
  ratio: "16:9",
  duration: 5,
  generate_audio: false,
  return_last_frame: false,
  watermark: false
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("seedanceClient", () => {
  it("creates tasks through the OpenAI Next /seedance/api/v3 proxy path", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "task_123" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSeedanceTask(payload, "user-key-a")).resolves.toEqual({ id: "task_123" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/seedance/api/v3/contents/generations/tasks");
    expect(init.headers).toMatchObject({ Authorization: "Bearer user-key-a" });
  });

  it("queries tasks through the OpenAI Next /seedance/api/v3 proxy path", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "task_123", status: "queued" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSeedanceTask("task_123", "user-key-a")).resolves.toMatchObject({ id: "task_123", status: "queued" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/seedance/api/v3/contents/generations/tasks/task_123");
    expect(init.headers).toMatchObject({ Authorization: "Bearer user-key-a" });
  });

  it("rejects HTML fallback pages instead of treating HTTP 200 as a valid task response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<!doctype html><title>Vectrust</title>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      }))
    );

    await expect(createSeedanceTask(payload, "user-key-a")).rejects.toThrow("Seedance 接口返回的不是 JSON");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
