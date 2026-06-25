import { describe, expect, it } from "vitest";
import { JsonTaskStore } from "./taskStore.js";
import { createTaskStore } from "./taskStoreFactory.js";
import { SupabaseTaskStore } from "./supabaseTaskStore.js";

describe("createTaskStore", () => {
  it("uses the JSON task store when Supabase is not configured", () => {
    const store = createTaskStore({
      dataFile: "data/tasks.json",
      supabase: {
        url: "",
        serviceRoleKey: "",
        table: "generation_tasks"
      }
    });

    expect(store).toBeInstanceOf(JsonTaskStore);
  });

  it("uses Supabase when URL and service role key are configured", () => {
    const store = createTaskStore({
      dataFile: "data/tasks.json",
      supabase: {
        url: "https://project.supabase.co",
        serviceRoleKey: "service-role-key",
        table: "generation_tasks"
      }
    });

    expect(store).toBeInstanceOf(SupabaseTaskStore);
  });
});
