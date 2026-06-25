import { createRequire } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { config } from "./config.js";
import type { ArchiveResult, ArchivedGeneratedImage, AssetRecord, GeneratedImage, MediaKind } from "./types.js";

const require = createRequire(import.meta.url);
const COS: any = require("cos-nodejs-sdk-v5");

const cos = new COS({
  SecretId: config.cos.secretId,
  SecretKey: config.cos.secretKey
});

const mimeToKind: Array<[RegExp, MediaKind]> = [
  [/^image\/(jpeg|png|webp|bmp|tiff|gif|heic|heif)$/i, "image"],
  [/^video\/(mp4|quicktime|webm)$/i, "video"],
  [/^audio\/(mpeg|mp3|wav|wave|x-wav|mp4|m4a|aac|ogg|flac|webm)$/i, "audio"]
];

export async function uploadAssetFile(file: Express.Multer.File): Promise<AssetRecord> {
  const kind = mediaKindFromMime(file.mimetype);
  if (!kind) {
    throw new Error("仅支持图片、视频或音频素材文件。");
  }

  const key = buildObjectKey("inputs", file.originalname);
  const signedUrl = await uploadBuffer({
    key,
    body: file.buffer,
    contentType: file.mimetype
  });

  return {
    id: randomUUID(),
    kind,
    key,
    mimeType: file.mimetype,
    size: file.size,
    signedUrl,
    createdAt: new Date().toISOString(),
    originalName: file.originalname
  };
}

export async function archiveOutputVideo(taskId: string, videoUrl: string): Promise<ArchiveResult> {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`下载平台视频失败：${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "video/mp4";
  const buffer = Buffer.from(await response.arrayBuffer());
  const key = buildObjectKey("outputs", `${taskId}.mp4`);
  const signedUrl = await uploadBuffer({
    key,
    body: buffer,
    contentType
  });

  return { key, signedUrl };
}

export async function archiveGeneratedImage(
  taskId: string,
  image: GeneratedImage,
  index: number
): Promise<ArchivedGeneratedImage> {
  const source = await readGeneratedImage(image);
  const extension = extensionFromMime(source.contentType);
  const key = buildObjectKey("outputs", `${taskId}-${index + 1}.${extension}`);
  const signedUrl = await uploadBuffer({
    key,
    body: source.buffer,
    contentType: source.contentType
  });

  return {
    revisedPrompt: image.revisedPrompt,
    sourceUrl: image.url,
    cosKey: key,
    cosUrl: signedUrl,
    mimeType: source.contentType,
    size: source.buffer.byteLength
  };
}

export function mediaKindFromMime(mimeType: string): MediaKind | null {
  return mimeToKind.find(([pattern]) => pattern.test(mimeType))?.[1] ?? null;
}

function buildObjectKey(prefix: "inputs" | "outputs", filename: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const safeName = sanitizeFilename(filename);
  return `seedance/${prefix}/${year}/${month}/${day}/${randomUUID()}-${safeName}`;
}

function sanitizeFilename(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  const stem = path.basename(filename, extension).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${stem || "asset"}${extension || ""}`;
}

async function readGeneratedImage(image: GeneratedImage): Promise<{ buffer: Buffer; contentType: string }> {
  if (image.url) {
    const response = await fetch(image.url);
    if (!response.ok) {
      throw new Error(`下载平台图片失败：${response.status} ${response.statusText}`);
    }

    const contentType = normalizeImageContentType(response.headers.get("content-type"));
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType
    };
  }

  if (image.b64Json) {
    const normalized = image.b64Json.includes(",") ? image.b64Json.split(",").pop() ?? "" : image.b64Json;
    return {
      buffer: Buffer.from(normalized, "base64"),
      contentType: "image/png"
    };
  }

  throw new Error("图片生成响应缺少可归档的图片内容。");
}

function normalizeImageContentType(contentType: string | null): string {
  const value = contentType?.split(";")[0]?.trim().toLowerCase();
  if (value?.startsWith("image/")) return value;
  return "image/png";
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

async function uploadBuffer(input: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  assertCosConfigured();

  await new Promise<void>((resolve, reject) => {
    cos.putObject(
      {
        Bucket: config.cos.bucket,
        Region: config.cos.region,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType
      },
      (error: Error | null) => {
        if (error) reject(error);
        else resolve();
      }
    );
  });

  return getSignedObjectUrl(input.key);
}

async function getSignedObjectUrl(key: string): Promise<string> {
  assertCosConfigured();

  return new Promise((resolve, reject) => {
    cos.getObjectUrl(
      {
        Bucket: config.cos.bucket,
        Region: config.cos.region,
        Key: key,
        Sign: true,
        Expires: config.cos.signedUrlExpiresSeconds
      },
      (error: Error | null, data: { Url?: string }) => {
        if (error) reject(error);
        else if (!data?.Url) reject(new Error("COS 未返回签名 URL。"));
        else resolve(data.Url);
      }
    );
  });
}

function assertCosConfigured(): void {
  const missing = [
    ["COS_BUCKET", config.cos.bucket],
    ["COS_REGION", config.cos.region],
    ["COS_SECRET_ID", config.cos.secretId],
    ["COS_SECRET_KEY", config.cos.secretKey]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`COS 环境变量未配置：${missing.join(", ")}`);
  }
}
