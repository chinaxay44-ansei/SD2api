import { describe, expect, it } from "vitest";
import {
  buildSeedancePayload,
  validateGenerateRequest
} from "./seedance.js";
import type { GenerateRequest } from "./types.js";

const baseRequest: GenerateRequest = {
  mode: "text",
  model: "doubao-seedance-2-0-260128",
  prompt: "雨后的上海街头，一辆复古电车缓慢驶过。",
  assets: [],
  resolution: "720p",
  ratio: "adaptive",
  duration: 5,
  generateAudio: true,
  returnLastFrame: false,
  watermark: false
};

describe("buildSeedancePayload", () => {
  it("maps text-to-video requests to the official content format", () => {
    const payload = buildSeedancePayload(baseRequest);

    expect(payload).toMatchObject({
      model: "doubao-seedance-2-0-260128",
      resolution: "720p",
      ratio: "adaptive",
      duration: 5,
      generate_audio: true,
      return_last_frame: false,
      watermark: false
    });
    expect(payload.content).toEqual([
      {
        type: "text",
        text: "雨后的上海街头，一辆复古电车缓慢驶过。"
      }
    ]);
  });

  it("assigns first and last frame roles for first-last image mode", () => {
    const payload = buildSeedancePayload({
      ...baseRequest,
      mode: "firstLastFrame",
      assets: [
        {
          id: "a1",
          kind: "image",
          key: "inputs/a.png",
          mimeType: "image/png",
          size: 100,
          signedUrl: "https://cos.example/a.png",
          createdAt: "2026-06-24T00:00:00.000Z"
        },
        {
          id: "a2",
          kind: "image",
          key: "inputs/b.png",
          mimeType: "image/png",
          size: 100,
          signedUrl: "https://cos.example/b.png",
          createdAt: "2026-06-24T00:00:00.000Z"
        }
      ]
    });

    expect(payload.content).toEqual([
      { type: "text", text: baseRequest.prompt },
      {
        type: "image_url",
        image_url: { url: "https://cos.example/a.png" },
        role: "first_frame"
      },
      {
        type: "image_url",
        image_url: { url: "https://cos.example/b.png" },
        role: "last_frame"
      }
    ]);
  });
});

describe("validateGenerateRequest", () => {
  it("rejects 1080p and 4k for the fast model", () => {
    const result = validateGenerateRequest({
      ...baseRequest,
      model: "doubao-seedance-2-0-fast-260128",
      resolution: "1080p"
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Seedance 2.0 Fast 不支持 1080p 或 4k。");
  });

  it("allows 4k for the standard model", () => {
    const result = validateGenerateRequest({
      ...baseRequest,
      resolution: "4k"
    });

    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("rejects multimodal requests that contain only audio assets", () => {
    const result = validateGenerateRequest({
      ...baseRequest,
      mode: "multimodal",
      assets: [
        {
          id: "audio",
          kind: "audio",
          key: "inputs/a.mp3",
          mimeType: "audio/mpeg",
          size: 100,
          signedUrl: "https://cos.example/a.mp3",
          createdAt: "2026-06-24T00:00:00.000Z"
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("多模态参考不能只包含音频，至少需要 1 个图片或视频素材。");
  });

  it("rejects multimodal requests that exceed Seedance 2 asset limits", () => {
    const images = Array.from({ length: 10 }, (_, index) => ({
      id: `image-${index}`,
      kind: "image" as const,
      key: `inputs/${index}.png`,
      mimeType: "image/png",
      size: 100,
      signedUrl: `https://cos.example/${index}.png`,
      createdAt: "2026-06-24T00:00:00.000Z"
    }));

    const result = validateGenerateRequest({
      ...baseRequest,
      mode: "multimodal",
      assets: images
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("多模态参考最多支持 9 个图片素材。");
  });
});
