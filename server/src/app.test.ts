import request from "supertest";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { AppServices } from "./app.js";
import type { MediaKind, TaskRecord } from "./types.js";

const userApiKey = "user-key-a";
const userKeyHash = hashKey(userApiKey);

function createServices(overrides: Partial<AppServices> = {}): AppServices {
  const records = new Map<string, TaskRecord>();

  return {
    uploadAsset: vi.fn(),
    createAssetUpload: vi.fn(async (file) => {
      const kind: MediaKind = file.mimeType.startsWith("video/") ? "video" : file.mimeType.startsWith("audio/") ? "audio" : "image";
      return {
        asset: {
          id: "asset-direct-1",
          kind,
          key: `inputs/${file.originalName}`,
          mimeType: file.mimeType,
          size: file.size,
          signedUrl: `https://cos.example/read/${file.originalName}`,
          createdAt: "2026-06-25T00:00:00.000Z",
          originalName: file.originalName
        },
        upload: {
          method: "PUT" as const,
          url: `https://cos.example/upload/${file.originalName}`,
          headers: { "Content-Type": file.mimeType }
        }
      };
    }),
    createTask: vi.fn(),
    getRemoteTask: vi.fn(),
    archiveOutput: vi.fn(),
    archiveImage: vi.fn(async (_taskId, image, index) => ({
      revisedPrompt: image.revisedPrompt,
      sourceUrl: image.url,
      cosKey: `outputs/image-${index + 1}.png`,
      cosUrl: `https://cos.example/outputs/image-${index + 1}.png`,
      mimeType: "image/png",
      size: 1024
    })),
    generateImage: vi.fn(),
    taskStore: {
      list: vi.fn(async (ownerHash: string) =>
        Array.from(records.values()).filter((record) => record.userKeyHash === ownerHash)
      ),
      get: vi.fn(async (id: string, ownerHash: string) => {
        const record = records.get(id);
        return record?.userKeyHash === ownerHash ? record : undefined;
      }),
      upsert: vi.fn(async (task: TaskRecord) => {
        records.set(task.id, task);
        return task;
      })
    },
    ...overrides
  };
}

describe("createApp", () => {
  it("requires an OpenAI Next API key before signing direct asset uploads", async () => {
    const app = createApp(createServices());

    const response = await request(app)
      .post("/api/assets/presign")
      .send({ originalName: "clip.mp4", mimeType: "video/mp4", size: 7 * 1024 * 1024 })
      .expect(401);

    expect(response.body.error).toBe("请先填写 OpenAI Next API Key。");
  });

  it("creates a direct COS upload ticket from file metadata instead of receiving the file body", async () => {
    const services = createServices();
    const app = createApp(services);

    const response = await request(app)
      .post("/api/assets/presign")
      .set("x-openai-next-key", userApiKey)
      .send({ originalName: "clip.mp4", mimeType: "video/mp4", size: 7 * 1024 * 1024 })
      .expect(200);

    expect(services.createAssetUpload).toHaveBeenCalledWith({
      originalName: "clip.mp4",
      mimeType: "video/mp4",
      size: 7 * 1024 * 1024
    });
    expect(response.body).toMatchObject({
      asset: {
        id: "asset-direct-1",
        kind: "video",
        originalName: "clip.mp4",
        signedUrl: "https://cos.example/read/clip.mp4"
      },
      upload: {
        method: "PUT",
        url: "https://cos.example/upload/clip.mp4",
        headers: { "Content-Type": "video/mp4" }
      }
    });
  });

  it("rejects asset uploads without a file", async () => {
    const app = createApp(createServices());

    const response = await request(app).post("/api/assets").expect(400);

    expect(response.body.error).toBe("请选择要上传的素材文件。");
  });

  it("requires an OpenAI Next API key before returning user-scoped task history", async () => {
    const app = createApp(createServices());

    const response = await request(app).get("/api/tasks").expect(401);

    expect(response.body.error).toBe("请先填写 OpenAI Next API Key。");
  });

  it("lists only tasks owned by the supplied OpenAI Next API key", async () => {
    const services = createServices();
    const app = createApp(services);

    await request(app).get("/api/tasks").set("x-openai-next-key", userApiKey).expect(200);

    expect(services.taskStore.list).toHaveBeenCalledWith(userKeyHash);
  });

  it("rejects generation requests with an empty prompt", async () => {
    const app = createApp(createServices());

    const response = await request(app)
      .post("/api/generate")
      .set("x-openai-next-key", userApiKey)
      .send({
        mode: "text",
        model: "doubao-seedance-2-0-260128",
        prompt: "",
        assets: [],
        resolution: "720p",
        ratio: "adaptive",
        duration: 5,
        generateAudio: true,
        returnLastFrame: false,
        watermark: false
      })
      .expect(400);

    expect(response.body.errors).toContain("请输入提示词。");
  });

  it("rejects image generation requests with an empty prompt", async () => {
    const app = createApp(createServices({ generateImage: vi.fn() } as any));

    const response = await request(app)
      .post("/api/images/generate")
      .set("x-openai-next-key", userApiKey)
      .send({
        model: "gpt-image-2",
        prompt: "",
        assets: [],
        n: 1,
        size: "1024x1024",
        responseFormat: "url"
      })
      .expect(400);

    expect(response.body.errors).toContain("请输入图片提示词。");
  });

  it("rejects image generation requests with more than four reference images", async () => {
    const app = createApp(createServices({ generateImage: vi.fn() } as any));
    const assets = Array.from({ length: 5 }, (_, index) => ({
      id: `asset-${index}`,
      kind: "image",
      key: `assets/${index}.png`,
      mimeType: "image/png",
      size: 1000,
      signedUrl: `https://cos.example/${index}.png`,
      createdAt: "2026-06-24T00:00:00.000Z"
    }));

    const response = await request(app)
      .post("/api/images/generate")
      .set("x-openai-next-key", userApiKey)
      .send({
        model: "gpt-image-2",
        prompt: "生成一张产品海报",
        assets,
        n: 1,
        size: "1024x1024",
        responseFormat: "url"
      })
      .expect(400);

    expect(response.body.errors).toContain("参考图片最多 4 张。");
  });

  it("archives generated image results to COS and stores an image task", async () => {
    const generateImage = vi.fn(async () => ({
      images: [{ url: "https://example.com/generated.png", revisedPrompt: "生成一张产品海报" }]
    }));
    const archiveImage = vi.fn(async (taskId: string, image: any, index: number) => ({
      revisedPrompt: image.revisedPrompt,
      sourceUrl: image.url,
      cosKey: `outputs/${taskId}-${index + 1}.png`,
      cosUrl: `https://cos.example/outputs/${taskId}-${index + 1}.png`,
      mimeType: "image/png",
      size: 2048
    }));
    const services = createServices({ generateImage, archiveImage } as any);
    const app = createApp(services);

    const response = await request(app)
      .post("/api/images/generate")
      .set("x-openai-next-key", userApiKey)
      .send({
        model: "gpt-image-2",
        prompt: "生成一张产品海报",
        assets: [],
        n: 1,
        size: "1024x1024",
        responseFormat: "url"
      })
      .expect(200);

    expect(generateImage).toHaveBeenCalledWith(
      {
        model: "gpt-image-2",
        prompt: "生成一张产品海报",
        n: 1,
        size: "1024x1024",
        response_format: "url"
      },
      userApiKey
    );
    expect(archiveImage).toHaveBeenCalledWith(expect.stringMatching(/^image-/), {
      url: "https://example.com/generated.png",
      revisedPrompt: "生成一张产品海报"
    }, 0);
    expect(response.body.task).toMatchObject({
      taskType: "image",
      model: "gpt-image-2",
      prompt: "生成一张产品海报",
      status: "succeeded",
      userKeyHash,
      outputImages: [
        expect.objectContaining({
          cosUrl: expect.stringContaining("https://cos.example/outputs/image-"),
          sourceUrl: "https://example.com/generated.png"
        })
      ]
    });
    expect(response.body.images[0].cosUrl).toContain("https://cos.example/outputs/image-");
    expect(services.taskStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: "image",
        status: "succeeded",
        outputImages: expect.any(Array)
      })
    );
  });

  it("accepts documented high-resolution GPT image sizes", async () => {
    const generateImage = vi.fn(async () => ({
      images: [{ url: "https://example.com/generated-4k.png" }]
    }));
    const app = createApp(createServices({ generateImage }));

    await request(app)
      .post("/api/images/generate")
      .set("x-openai-next-key", userApiKey)
      .send({
        model: "gpt-image-2",
        prompt: "生成一张 4K 横屏发布会背景图",
        assets: [],
        n: 1,
        size: "3840x2160",
        responseFormat: "url"
      })
      .expect(200);

    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        size: "3840x2160"
      }),
      userApiKey
    );
  });

  it("persists a newly created remote task", async () => {
    const createTask = vi.fn(async () => ({ id: "seedance-task-1" }));
    const taskStore = createServices().taskStore;
    const app = createApp(createServices({ createTask, taskStore }));

    await request(app)
      .post("/api/generate")
      .set("x-openai-next-key", userApiKey)
      .send({
        mode: "text",
        model: "doubao-seedance-2-0-260128",
        prompt: "城市夜景延时摄影",
        assets: [],
        resolution: "720p",
        ratio: "adaptive",
        duration: 5,
        generateAudio: true,
        returnLastFrame: false,
        watermark: false
      })
      .expect(200);

    expect(taskStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "seedance-task-1",
        status: "queued",
        prompt: "城市夜景延时摄影",
        userKeyHash
      })
    );
    expect(createTask).toHaveBeenCalledWith(expect.any(Object), userApiKey);
  });

  it("stores a succeeded remote platform video URL without archiving to COS", async () => {
    const existing: TaskRecord = {
      id: "seedance-task-2",
      model: "doubao-seedance-2-0-260128",
      prompt: "海岸线航拍",
      status: "running",
      userKeyHash,
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z"
    };
    const services = createServices({
      getRemoteTask: vi.fn(async () => ({
        id: "seedance-task-2",
        model: "doubao-seedance-2-0-260128",
        status: "succeeded" as const,
        content: { video_url: "https://platform.example/out.mp4" },
        error: null
      })),
      archiveOutput: vi.fn()
    });
    vi.mocked(services.taskStore.get).mockResolvedValue(existing);
    const app = createApp(services);

    const response = await request(app).get("/api/tasks/seedance-task-2").set("x-openai-next-key", userApiKey).expect(200);

    expect(services.taskStore.get).toHaveBeenCalledWith("seedance-task-2", userKeyHash);
    expect(services.getRemoteTask).toHaveBeenCalledWith("seedance-task-2", userApiKey);
    expect(services.archiveOutput).not.toHaveBeenCalled();
    expect(response.body.task).toMatchObject({
      id: "seedance-task-2",
      status: "succeeded",
      videoUrl: "https://platform.example/out.mp4"
    });
    expect(response.body.task.cosVideoUrl).toBeUndefined();
  });

  it("keeps a stored platform video URL without archiving when refreshing succeeded tasks", async () => {
    const existing: TaskRecord = {
      id: "seedance-task-stored-url",
      taskType: "video",
      model: "doubao-seedance-2-0-260128",
      prompt: "已成功但未归档的视频",
      status: "succeeded",
      userKeyHash,
      videoUrl: "https://platform.example/stored.mp4",
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z"
    };
    const services = createServices({
      getRemoteTask: vi.fn(async () => ({
        id: "seedance-task-stored-url",
        model: "doubao-seedance-2-0-260128",
        status: "succeeded" as const,
        content: {},
        error: null
      })),
      archiveOutput: vi.fn()
    });
    vi.mocked(services.taskStore.get).mockResolvedValue(existing);
    const app = createApp(services);

    const response = await request(app)
      .get("/api/tasks/seedance-task-stored-url")
      .set("x-openai-next-key", userApiKey)
      .expect(200);

    expect(services.archiveOutput).not.toHaveBeenCalled();
    expect(response.body.task).toMatchObject({
      id: "seedance-task-stored-url",
      taskType: "video",
      status: "succeeded",
      videoUrl: "https://platform.example/stored.mp4"
    });
    expect(response.body.task.cosVideoUrl).toBeUndefined();
  });

  it("manually queries an untracked succeeded Seedance task without blocking on COS archiving", async () => {
    const services = createServices({
      getRemoteTask: vi.fn(async () => ({
        id: "task_manualsuccess",
        model: "doubao-seedance-2-0-260128",
        status: "succeeded" as const,
        content: { video_url: "https://platform.example/manual.mp4" },
        error: null
      })),
      archiveOutput: vi.fn()
    });
    vi.mocked(services.taskStore.get).mockResolvedValue(undefined);
    const app = createApp(services);

    const response = await request(app)
      .post("/api/tasks/query")
      .set("x-openai-next-key", userApiKey)
      .send({ id: "任务 task_manualsuccess" })
      .expect(200);

    expect(services.taskStore.get).toHaveBeenCalledWith("task_manualsuccess", userKeyHash);
    expect(services.getRemoteTask).toHaveBeenCalledWith("task_manualsuccess", userApiKey);
    expect(services.archiveOutput).not.toHaveBeenCalled();
    expect(services.taskStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "task_manualsuccess",
        taskType: "video",
        prompt: "手动查询 task_manualsuccess",
        status: "succeeded",
        userKeyHash,
        videoUrl: "https://platform.example/manual.mp4",
        cosVideoUrl: undefined
      })
    );
    expect(response.body.task).toMatchObject({
      id: "task_manualsuccess",
      status: "succeeded",
      videoUrl: "https://platform.example/manual.mp4"
    });
    expect(response.body.task.cosVideoUrl).toBeUndefined();
  });

  it("manually queries a failed Seedance task and stores the remote error message", async () => {
    const services = createServices({
      getRemoteTask: vi.fn(async () => ({
        id: "task_manualfailed",
        model: "doubao-seedance-2-0-260128",
        status: "failed" as const,
        error: { message: "Height must be between 300px and 6000px." }
      })),
      archiveOutput: vi.fn()
    });
    vi.mocked(services.taskStore.get).mockResolvedValue(undefined);
    const app = createApp(services);

    const response = await request(app)
      .post("/api/tasks/query")
      .set("x-openai-next-key", userApiKey)
      .send({ id: "task_manualfailed" })
      .expect(200);

    expect(services.archiveOutput).not.toHaveBeenCalled();
    expect(response.body.task).toMatchObject({
      id: "task_manualfailed",
      status: "failed",
      errorMessage: "Height must be between 300px and 6000px."
    });
  });

  it("normalizes OpenAI Next processing status to running so the frontend keeps polling", async () => {
    const existing: TaskRecord = {
      id: "seedance-task-3",
      model: "doubao-seedance-2-0-260128",
      prompt: "雨夜街头",
      status: "queued",
      userKeyHash,
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z"
    };
    const services = createServices({
      getRemoteTask: vi.fn(async () => ({
        id: "cgt-20260624",
        model: "doubao-seedance-2-0-260128",
        status: "processing" as any
      }))
    });
    vi.mocked(services.taskStore.get).mockResolvedValue(existing);
    const app = createApp(services);

    const response = await request(app).get("/api/tasks/seedance-task-3").set("x-openai-next-key", userApiKey).expect(200);

    expect(response.body.task).toMatchObject({
      id: "seedance-task-3",
      status: "running"
    });
  });

  it("does not query the remote platform for tasks owned by another API key", async () => {
    const services = createServices({
      getRemoteTask: vi.fn()
    });
    vi.mocked(services.taskStore.get).mockResolvedValue(undefined);
    const app = createApp(services);

    const response = await request(app).get("/api/tasks/seedance-task-private").set("x-openai-next-key", userApiKey).expect(404);

    expect(response.body.error).toBe("任务不存在，或不属于当前 API Key。");
    expect(services.getRemoteTask).not.toHaveBeenCalled();
  });
});

function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
