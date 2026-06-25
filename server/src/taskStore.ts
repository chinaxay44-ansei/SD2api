import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TaskRecord } from "./types.js";

export interface TaskStore {
  list(userKeyHash: string): Promise<TaskRecord[]>;
  get(id: string, userKeyHash: string): Promise<TaskRecord | undefined>;
  upsert(task: TaskRecord): Promise<TaskRecord>;
}

export class JsonTaskStore implements TaskStore {
  constructor(private readonly filePath: string) {}

  async list(userKeyHash: string): Promise<TaskRecord[]> {
    const tasks = await this.readAll();
    return tasks
      .filter((task) => task.userKeyHash === userKeyHash)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 50);
  }

  async get(id: string, userKeyHash: string): Promise<TaskRecord | undefined> {
    const tasks = await this.readAll();
    return tasks.find((task) => task.id === id && task.userKeyHash === userKeyHash);
  }

  async upsert(task: TaskRecord): Promise<TaskRecord> {
    const tasks = await this.readAll();
    const index = tasks.findIndex((existing) => existing.id === task.id);
    if (index >= 0) {
      tasks[index] = task;
    } else {
      tasks.push(task);
    }
    await this.writeAll(tasks);
    return task;
  }

  private async readAll(): Promise<TaskRecord[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }

  private async writeAll(tasks: TaskRecord[]): Promise<void> {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const tempFile = `${this.filePath}.tmp`;
    await writeFile(tempFile, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
    await rename(tempFile, this.filePath);
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
