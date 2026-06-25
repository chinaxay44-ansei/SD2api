import { JsonTaskStore, type TaskStore } from "./taskStore.js";
import { SupabaseTaskStore } from "./supabaseTaskStore.js";

export interface TaskStoreFactoryOptions {
  dataFile: string;
  supabase: {
    url: string;
    serviceRoleKey: string;
    table: string;
  };
}

export function createTaskStore(options: TaskStoreFactoryOptions): TaskStore {
  if (options.supabase.url && options.supabase.serviceRoleKey) {
    return new SupabaseTaskStore(options.supabase);
  }
  return new JsonTaskStore(options.dataFile);
}
