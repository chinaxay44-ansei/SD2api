import { createRequire } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { config } from "./config.js";
import type { ArchiveResult, AssetRecord, MediaKind } from "./types.js";

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
