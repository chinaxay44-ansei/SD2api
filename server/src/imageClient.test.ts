import { afterEach, describe, expect, it, vi } from "vitest";
import { generateGptImage } from "./imageClient.js";
import type { GptImageRequest } from "./types.js";

const request: GptImageRequest = {
  model: "gpt-image-2",
  prompt: "A clean product poster with soft studio lighting.",
  image: ["https://cos.example/reference.png"],
  n: 1,
  size: "1024x1024",
  response_format: "url"
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("imageClient", () => {
  it("generates images through the OpenAI Next Draw images endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        created: 1776768940,
        data: [{ revised_prompt: "A refined prompt.", url: "https://example.com/generated.webp" }]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateGptImage(request, "user-key-a")).resolves.toEqual({
      images: [{ revisedPrompt: "A refined prompt.", url: "https://example.com/generated.webp" }]
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://draw.openai-next.com/v1/images/generations");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer user-key-a",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "gpt-image-2",
      prompt: "A clean product poster with soft studio lighting.",
      image: ["https://cos.example/reference.png"],
      n: 1,
      size: "1024x1024",
      response_format: "url"
    });
  });

  it("supports base64 image responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: [{ b64_json: "iVBORw0KGgo=", revised_prompt: "" }] }))
    );

    await expect(generateGptImage({ ...request, response_format: "b64_json" }, "user-key-a")).resolves.toEqual({
      images: [{ b64Json: "iVBORw0KGgo=", revisedPrompt: "" }]
    });
  });

  it("rejects non-JSON fallback pages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<!doctype html><title>OpenAI Next</title>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        })
      )
    );

    await expect(generateGptImage(request, "user-key-a")).rejects.toThrow("图片生成接口返回的不是 JSON");
  });

  it("reports network failures with image endpoint context", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    await expect(generateGptImage(request, "user-key-a")).rejects.toThrow("图片生成接口请求失败：network down");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
