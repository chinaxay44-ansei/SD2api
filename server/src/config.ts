import { loadEnvFile } from "node:process";

try {
  loadEnvFile();
} catch (error) {
  if (!isMissingEnvFile(error)) throw error;
}

export const config = {
  server: {
    port: numberEnv("SERVER_PORT", numberEnv("PORT", 8787))
  },
  openAiNext: {
    baseUrl: process.env.OPENAI_NEXT_SEEDANCE_BASE_URL?.trim() || "https://api.openai-next.com/seedance",
    imageGenerationsUrl:
      process.env.OPENAI_NEXT_IMAGE_GENERATIONS_URL?.trim() || "https://api.openai-next.com/v1/images/generations"
  },
  cos: {
    bucket: env("COS_BUCKET"),
    region: env("COS_REGION"),
    secretId: env("COS_SECRET_ID"),
    secretKey: env("COS_SECRET_KEY"),
    signedUrlExpiresSeconds: numberEnv("COS_SIGNED_URL_EXPIRES_SECONDS", 7 * 24 * 60 * 60)
  },
  upload: {
    maxBytes: 500 * 1024 * 1024,
    signedUrlExpiresSeconds: numberEnv("COS_UPLOAD_SIGNED_URL_EXPIRES_SECONDS", 15 * 60)
  },
  supabase: {
    url: process.env.SUPABASE_URL?.trim() ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "",
    table: process.env.SUPABASE_TASKS_TABLE?.trim() || "generation_tasks"
  }
} as const;

function isMissingEnvFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function numberEnv(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
