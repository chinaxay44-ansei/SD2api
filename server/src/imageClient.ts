import type { GeneratedImage, GptImageRequest, GptImageResult } from "./types.js";
import { config } from "./config.js";

export async function generateGptImage(payload: GptImageRequest, apiKey: string): Promise<GptImageResult> {
  let response: Response;
  try {
    response = await fetch(config.openAiNext.imageGenerationsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error(`图片生成接口请求失败：${error instanceof Error ? error.message : "网络请求失败"}`);
  }

  const body = await safeJson(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(body, `图片生成失败：${response.status} ${response.statusText}`));
  }

  const images = extractImages(body);
  if (images.length === 0) {
    throw new Error("图片生成响应缺少图片结果。");
  }

  return { images };
}

async function safeJson(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!text) return {};
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`图片生成接口返回的不是 JSON：${contentType || "unknown content-type"}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("图片生成接口返回的 JSON 无法解析。");
  }
}

function extractErrorMessage(body: any, fallback: string): string {
  return body?.error?.message ?? body?.message ?? body?.msg ?? fallback;
}

function extractImages(body: any): GeneratedImage[] {
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.flatMap((item: any) => {
    const image: GeneratedImage = {};
    if (typeof item?.url === "string" && item.url.trim()) image.url = item.url;
    if (typeof item?.b64_json === "string" && item.b64_json.trim()) image.b64Json = item.b64_json;
    if (typeof item?.revised_prompt === "string") image.revisedPrompt = item.revised_prompt;
    return image.url || image.b64Json ? [image] : [];
  });
}
