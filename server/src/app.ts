import express from "express";
import multer from "multer";
import { hashOpenAiNextApiKey, readOpenAiNextApiKey } from "./apiKeyAuth.js";
import { config } from "./config.js";
import { buildSeedancePayload, validateGenerateRequest } from "./seedance.js";
import type {
  ArchiveResult,
  GptImageRequest,
  GptImageResult,
  GenerateRequest,
  ImageGenerateRequest,
  SeedancePayload,
  SeedanceTaskResponse,
  TaskRecord
} from "./types.js";
import type { TaskStore } from "./taskStore.js";

export interface AppServices {
  uploadAsset(file: Express.Multer.File): Promise<unknown>;
  createTask(payload: SeedancePayload, apiKey: string): Promise<{ id: string }>;
  getRemoteTask(id: string, apiKey: string): Promise<SeedanceTaskResponse>;
  archiveOutput(taskId: string, videoUrl: string): Promise<ArchiveResult>;
  generateImage(payload: GptImageRequest, apiKey: string): Promise<GptImageResult>;
  taskStore: TaskStore;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxBytes }
});

const supportedGptImageSizes = new Set([
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "1024x1792",
  "2048x2048",
  "2048x1152",
  "3840x2160",
  "2160x3840",
  "auto"
]);

export function createApp(services: AppServices): express.Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/tasks", async (_request, response, next) => {
    try {
      const identity = requestIdentity(_request, response);
      if (!identity) return;
      response.json({ tasks: await services.taskStore.list(identity.userKeyHash) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/assets", upload.single("file"), async (request, response, next) => {
    try {
      if (!request.file) {
        response.status(400).json({ error: "请选择要上传的素材文件。" });
        return;
      }

      const asset = await services.uploadAsset(request.file);
      response.json({ asset });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/generate", async (request, response, next) => {
    try {
      const generateRequest = normalizeGenerateRequest(request.body);
      const identity = requestIdentity(request, response);
      if (!identity) return;
      const validation = validateGenerateRequest(generateRequest);
      if (!validation.ok) {
        response.status(400).json({ errors: validation.errors });
        return;
      }

      const payload = buildSeedancePayload(generateRequest);
      const remoteTask = await services.createTask(payload, identity.apiKey);
      const now = new Date().toISOString();
      const task: TaskRecord = {
        id: remoteTask.id,
        model: generateRequest.model,
        prompt: generateRequest.prompt.trim(),
        status: "queued",
        userKeyHash: identity.userKeyHash,
        createdAt: now,
        updatedAt: now,
        request: generateRequest
      };
      await services.taskStore.upsert(task);
      response.json({ task });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/images/generate", async (request, response, next) => {
    try {
      const imageRequest = normalizeImageGenerateRequest(request.body);
      const identity = requestIdentity(request, response);
      if (!identity) return;
      const errors = validateImageGenerateRequest(imageRequest);
      if (errors.length > 0) {
        response.status(400).json({ errors });
        return;
      }

      const result = await services.generateImage(buildGptImagePayload(imageRequest), identity.apiKey);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks/:id", async (request, response, next) => {
    try {
      const id = request.params.id;
      const identity = requestIdentity(request, response);
      if (!identity) return;
      const existing = await services.taskStore.get(id, identity.userKeyHash);
      if (!existing) {
        response.status(404).json({ error: "任务不存在，或不属于当前 API Key。" });
        return;
      }

      const remote = await services.getRemoteTask(id, identity.apiKey);
      const now = new Date().toISOString();
      const status = normalizeRemoteStatus(remote.status);
      const videoUrl = remote.content?.video_url;
      const lastFrameUrl = remote.content?.last_frame_url;
      let cosVideoKey = existing?.cosVideoKey;
      let cosVideoUrl = existing?.cosVideoUrl;

      if (status === "succeeded" && videoUrl && !cosVideoUrl) {
        const archive = await services.archiveOutput(id, videoUrl);
        cosVideoKey = archive.key;
        cosVideoUrl = archive.signedUrl;
      }

      const task: TaskRecord = {
        id,
        model: remote.model ?? existing?.model ?? "",
        prompt: existing?.prompt ?? "",
        userKeyHash: identity.userKeyHash,
        request: existing?.request,
        status,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        videoUrl,
        lastFrameUrl,
        cosVideoKey,
        cosVideoUrl,
        errorMessage: remote.error?.message
      };

      await services.taskStore.upsert(task);
      response.json({ task, remote });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "服务器内部错误。";
    response.status(isClientError(message) ? 400 : 500).json({ error: message });
  });

  return app;
}

function requestIdentity(request: express.Request, response: express.Response): { apiKey: string; userKeyHash: string } | undefined {
  const apiKey = readOpenAiNextApiKey(request);
  if (!apiKey) {
    response.status(401).json({ error: "请先填写 OpenAI Next API Key。" });
    return undefined;
  }
  return {
    apiKey,
    userKeyHash: hashOpenAiNextApiKey(apiKey)
  };
}

function normalizeGenerateRequest(body: any): GenerateRequest {
  return {
    mode: body?.mode,
    model: body?.model,
    prompt: typeof body?.prompt === "string" ? body.prompt : "",
    assets: Array.isArray(body?.assets) ? body.assets : [],
    resolution: body?.resolution ?? "720p",
    ratio: body?.ratio ?? "adaptive",
    duration: Number(body?.duration ?? 5),
    generateAudio: Boolean(body?.generateAudio),
    returnLastFrame: Boolean(body?.returnLastFrame),
    watermark: Boolean(body?.watermark)
  };
}

function normalizeImageGenerateRequest(body: any): ImageGenerateRequest {
  return {
    model: body?.model,
    prompt: typeof body?.prompt === "string" ? body.prompt : "",
    assets: Array.isArray(body?.assets) ? body.assets : [],
    n: Number(body?.n ?? 1),
    size: body?.size ?? "1024x1024",
    responseFormat: body?.responseFormat ?? "url"
  };
}

function validateImageGenerateRequest(request: ImageGenerateRequest): string[] {
  const errors: string[] = [];
  if (request.model !== "gpt-image-2") errors.push("仅支持 gpt-image-2 模型。");
  if (!request.prompt.trim()) errors.push("请输入图片提示词。");
  if (!Number.isInteger(request.n) || request.n < 1 || request.n > 4) errors.push("图片数量需为 1 到 4。");
  if (!supportedGptImageSizes.has(request.size)) {
    errors.push("不支持的图片尺寸。");
  }
  if (!["url", "b64_json"].includes(request.responseFormat)) {
    errors.push("不支持的图片返回格式。");
  }
  if (request.assets.length > 4) errors.push("参考图片最多 4 张。");
  if (request.assets.some((asset) => asset?.kind !== "image")) errors.push("图片生成参考素材只能是图片。");
  return errors;
}

function buildGptImagePayload(request: ImageGenerateRequest): GptImageRequest {
  const imageUrls = request.assets.map((asset) => asset.signedUrl).filter(Boolean);
  return {
    model: "gpt-image-2",
    prompt: request.prompt.trim(),
    ...(imageUrls.length > 0 ? { image: imageUrls } : {}),
    n: request.n,
    size: request.size,
    response_format: request.responseFormat
  };
}

function isClientError(message: string): boolean {
  return (
    message.includes("仅支持") ||
    message.includes("请选择") ||
    message.includes("缺少") ||
    message.includes("请输入") ||
    message.includes("不支持") ||
    message.includes("最多")
  );
}

function normalizeRemoteStatus(status: string): TaskRecord["status"] {
  if (status === "processing" || status === "in_progress") return "running";
  if (status === "pending") return "queued";
  if (status === "completed" || status === "success") return "succeeded";
  if (status === "fail") return "failed";
  if (["queued", "running", "succeeded", "failed", "cancelled", "expired"].includes(status)) {
    return status as TaskRecord["status"];
  }
  return "running";
}
