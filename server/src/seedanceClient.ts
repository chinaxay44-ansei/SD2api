import { config } from "./config.js";
import type { SeedancePayload, SeedanceTaskResponse } from "./types.js";

export interface CreateTaskResponse {
  id: string;
}

const TASKS_PATH = "/api/v3/contents/generations/tasks";

export async function createSeedanceTask(payload: SeedancePayload, apiKey: string): Promise<CreateTaskResponse> {
  const response = await fetch(`${config.openAiNext.baseUrl}${TASKS_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const body = await safeJson(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(body, `创建任务失败：${response.status} ${response.statusText}`));
  }

  const id = extractTaskId(body);
  if (!id) {
    throw new Error("创建任务响应缺少 id。");
  }

  return { id };
}

export async function getSeedanceTask(id: string, apiKey: string): Promise<SeedanceTaskResponse> {
  const response = await fetch(`${config.openAiNext.baseUrl}${TASKS_PATH}/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  const body = await safeJson(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(body, `查询任务失败：${response.status} ${response.statusText}`));
  }

  return body as SeedanceTaskResponse;
}

async function safeJson(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!text) return {};
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Seedance 接口返回的不是 JSON：${contentType || "unknown content-type"}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Seedance 接口返回的 JSON 无法解析。");
  }
}

function extractErrorMessage(body: any, fallback: string): string {
  return body?.error?.message ?? body?.message ?? body?.msg ?? fallback;
}

function extractTaskId(body: any): string | undefined {
  for (const candidate of [body?.id, body?.task_id, body?.data?.id, body?.data?.task_id]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return undefined;
}
