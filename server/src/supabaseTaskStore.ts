import type { TaskStore } from "./taskStore.js";
import type { TaskRecord, TaskStatus } from "./types.js";

export interface SupabaseTaskStoreOptions {
  url: string;
  serviceRoleKey: string;
  table?: string;
}

type SupabaseTaskRow = {
  id: string;
  model: string;
  prompt: string;
  status: TaskStatus;
  user_key_hash: string;
  created_at: string;
  updated_at: string;
  request?: TaskRecord["request"] | null;
  video_url?: string | null;
  last_frame_url?: string | null;
  cos_video_key?: string | null;
  cos_video_url?: string | null;
  error_message?: string | null;
};

export class SupabaseTaskStore implements TaskStore {
  private readonly restUrl: string;
  private readonly serviceRoleKey: string;

  constructor(options: SupabaseTaskStoreOptions) {
    const table = options.table?.trim() || "generation_tasks";
    this.restUrl = `${options.url.replace(/\/+$/, "")}/rest/v1/${encodeURIComponent(table)}`;
    this.serviceRoleKey = options.serviceRoleKey;
  }

  async list(userKeyHash: string): Promise<TaskRecord[]> {
    const rows = await this.request<SupabaseTaskRow[]>(
      `${this.restUrl}?select=*&user_key_hash=eq.${encodeURIComponent(userKeyHash)}&order=updated_at.desc&limit=50`
    );
    return rows.map(fromRow);
  }

  async get(id: string, userKeyHash: string): Promise<TaskRecord | undefined> {
    const rows = await this.request<SupabaseTaskRow[]>(
      `${this.restUrl}?select=*&id=eq.${encodeURIComponent(id)}&user_key_hash=eq.${encodeURIComponent(userKeyHash)}&limit=1`
    );
    return rows[0] ? fromRow(rows[0]) : undefined;
  }

  async upsert(task: TaskRecord): Promise<TaskRecord> {
    const rows = await this.request<SupabaseTaskRow[]>(this.restUrl, {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(toRow(task))
    });
    return rows[0] ? fromRow(rows[0]) : task;
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          ...this.headers(),
          ...(init.headers ?? {})
        }
      });
    } catch (error) {
      throw new Error(`Supabase 任务库请求失败：${error instanceof Error ? error.message : "网络请求失败"}`);
    }

    const body = await safeJson(response);
    if (!response.ok) {
      throw new Error(`Supabase 任务库请求失败：${extractErrorMessage(body, `${response.status} ${response.statusText}`)}`);
    }
    return body as T;
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      "Content-Type": "application/json"
    };
  }
}

function toRow(task: TaskRecord): SupabaseTaskRow {
  return {
    id: task.id,
    model: task.model,
    prompt: task.prompt,
    status: task.status,
    user_key_hash: task.userKeyHash,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    request: task.request ?? null,
    video_url: task.videoUrl ?? null,
    last_frame_url: task.lastFrameUrl ?? null,
    cos_video_key: task.cosVideoKey ?? null,
    cos_video_url: task.cosVideoUrl ?? null,
    error_message: task.errorMessage ?? null
  };
}

function fromRow(row: SupabaseTaskRow): TaskRecord {
  return {
    id: row.id,
    model: row.model,
    prompt: row.prompt,
    status: row.status,
    userKeyHash: row.user_key_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    request: row.request ?? undefined,
    videoUrl: row.video_url ?? undefined,
    lastFrameUrl: row.last_frame_url ?? undefined,
    cosVideoKey: row.cos_video_key ?? undefined,
    cosVideoUrl: row.cos_video_url ?? undefined,
    errorMessage: row.error_message ?? undefined
  };
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Supabase 任务库返回的 JSON 无法解析。");
  }
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) return fallback;
  if ("message" in body && typeof body.message === "string") return body.message;
  if ("error" in body && typeof body.error === "string") return body.error;
  return fallback;
}
