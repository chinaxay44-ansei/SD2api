import { afterEach, describe, expect, it, vi } from "vitest";
import { SupabaseTaskStore } from "./supabaseTaskStore.js";
import type { TaskRecord } from "./types.js";

const task: TaskRecord = {
  id: "task-a",
  model: "doubao-seedance-2-0-260128",
  prompt: "A short video prompt.",
  status: "succeeded",
  userKeyHash: "owner-a",
  createdAt: "2026-06-25T00:00:00.000Z",
  updatedAt: "2026-06-25T00:02:00.000Z",
  videoUrl: "https://platform.example/video.mp4",
  cosVideoKey: "outputs/task-a.mp4",
  cosVideoUrl: "https://cos.example/task-a.mp4"
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SupabaseTaskStore", () => {
  it("lists recent tasks from the Supabase generation_tasks table", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([
        {
          id: "task-a",
          model: "doubao-seedance-2-0-260128",
          prompt: "A short video prompt.",
          status: "succeeded",
          user_key_hash: "owner-a",
          created_at: "2026-06-25T00:00:00.000Z",
          updated_at: "2026-06-25T00:02:00.000Z",
          video_url: "https://platform.example/video.mp4",
          cos_video_key: "outputs/task-a.mp4",
          cos_video_url: "https://cos.example/task-a.mp4"
        }
      ])
    );
    vi.stubGlobal("fetch", fetchMock);
    const store = new SupabaseTaskStore({
      url: "https://project.supabase.co",
      serviceRoleKey: "service-role-key",
      table: "generation_tasks"
    });

    await expect(store.list("owner-a")).resolves.toEqual([task]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe(
      "https://project.supabase.co/rest/v1/generation_tasks?select=*&user_key_hash=eq.owner-a&order=updated_at.desc&limit=50"
    );
    expect(init.headers).toMatchObject({
      apikey: "service-role-key",
      Authorization: "Bearer service-role-key"
    });
  });

  it("upserts tasks using snake_case Supabase columns", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([
        {
          id: "task-a",
          model: "doubao-seedance-2-0-260128",
          prompt: "A short video prompt.",
          status: "succeeded",
          user_key_hash: "owner-a",
          created_at: "2026-06-25T00:00:00.000Z",
          updated_at: "2026-06-25T00:02:00.000Z",
          video_url: "https://platform.example/video.mp4",
          cos_video_key: "outputs/task-a.mp4",
          cos_video_url: "https://cos.example/task-a.mp4"
        }
      ])
    );
    vi.stubGlobal("fetch", fetchMock);
    const store = new SupabaseTaskStore({
      url: "https://project.supabase.co/",
      serviceRoleKey: "service-role-key",
      table: "generation_tasks"
    });

    await expect(store.upsert(task)).resolves.toEqual(task);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://project.supabase.co/rest/v1/generation_tasks");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Prefer: "resolution=merge-duplicates,return=representation"
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      id: "task-a",
      user_key_hash: "owner-a",
      created_at: "2026-06-25T00:00:00.000Z",
      updated_at: "2026-06-25T00:02:00.000Z",
      video_url: "https://platform.example/video.mp4",
      cos_video_key: "outputs/task-a.mp4",
      cos_video_url: "https://cos.example/task-a.mp4"
    });
  });

  it("reports Supabase response errors with endpoint context", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "permission denied" }, { status: 401, statusText: "Unauthorized" }))
    );
    const store = new SupabaseTaskStore({
      url: "https://project.supabase.co",
      serviceRoleKey: "bad-key",
      table: "generation_tasks"
    });

    await expect(store.list("owner-a")).rejects.toThrow("Supabase 任务库请求失败：permission denied");
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
