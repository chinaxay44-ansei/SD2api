import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonTaskStore } from "./taskStore.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("JsonTaskStore", () => {
  it("creates a task file and returns newest tasks first", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "seedance-store-"));
    tempDirs.push(dir);
    const store = new JsonTaskStore(path.join(dir, "tasks.json"));

    await store.upsert({
      id: "task-a",
      model: "doubao-seedance-2-0-260128",
      prompt: "first",
      status: "queued",
      userKeyHash: "owner-a",
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z"
    });
    await store.upsert({
      id: "task-b",
      model: "doubao-seedance-2-0-fast-260128",
      prompt: "second",
      status: "running",
      userKeyHash: "owner-a",
      createdAt: "2026-06-24T00:01:00.000Z",
      updatedAt: "2026-06-24T00:01:00.000Z"
    });
    await store.upsert({
      id: "task-c",
      model: "doubao-seedance-2-0-fast-260128",
      prompt: "third",
      status: "running",
      userKeyHash: "owner-b",
      createdAt: "2026-06-24T00:03:00.000Z",
      updatedAt: "2026-06-24T00:03:00.000Z"
    });

    await expect(store.list("owner-a")).resolves.toMatchObject([
      { id: "task-b" },
      { id: "task-a" }
    ]);
    await expect(readFile(path.join(dir, "tasks.json"), "utf8")).resolves.toContain("task-a");
  });

  it("updates an existing task instead of duplicating it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "seedance-store-"));
    tempDirs.push(dir);
    const store = new JsonTaskStore(path.join(dir, "tasks.json"));

    await store.upsert({
      id: "task-a",
      model: "doubao-seedance-2-0-260128",
      prompt: "first",
      status: "queued",
      userKeyHash: "owner-a",
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z"
    });
    await store.upsert({
      id: "task-a",
      model: "doubao-seedance-2-0-260128",
      prompt: "first",
      status: "succeeded",
      userKeyHash: "owner-a",
      videoUrl: "https://platform.example/video.mp4",
      cosVideoUrl: "https://cos.example/video.mp4",
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:02:00.000Z"
    });

    await expect(store.list("owner-a")).resolves.toHaveLength(1);
    await expect(store.get("task-a", "owner-a")).resolves.toMatchObject({
      status: "succeeded",
      cosVideoUrl: "https://cos.example/video.mp4"
    });
    await expect(store.get("task-a", "owner-b")).resolves.toBeUndefined();
  });
});
