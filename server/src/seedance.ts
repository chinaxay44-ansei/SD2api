import type {
  AssetRecord,
  GenerateRequest,
  SeedanceAudioContent,
  SeedanceContent,
  SeedanceImageContent,
  SeedancePayload,
  SeedanceVideoContent
} from "./types.js";

export const SEEDANCE_MODELS = [
  "doubao-seedance-2-0-260128",
  "doubao-seedance-2-0-fast-260128"
] as const;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateGenerateRequest(request: GenerateRequest): ValidationResult {
  const errors: string[] = [];
  const prompt = request.prompt?.trim() ?? "";
  const assets = Array.isArray(request.assets) ? request.assets : [];
  const images = assets.filter((asset) => asset.kind === "image");
  const videos = assets.filter((asset) => asset.kind === "video");
  const audios = assets.filter((asset) => asset.kind === "audio");

  if (!prompt) {
    errors.push("请输入提示词。");
  }

  if (!SEEDANCE_MODELS.includes(request.model)) {
    errors.push("请选择 Seedance 2.0 Standard 或 Fast 模型。");
  }

  if (request.model === "doubao-seedance-2-0-fast-260128" && ["1080p", "4k"].includes(request.resolution)) {
    errors.push("Seedance 2.0 Fast 不支持 1080p 或 4k。");
  }

  if (!Number.isInteger(request.duration) || (request.duration !== -1 && (request.duration < 4 || request.duration > 15))) {
    errors.push("Seedance 2.0 时长需为 4 到 15 秒，或设置为 -1 由模型自动选择。");
  }

  if (request.mode === "firstFrame" && images.length < 1) {
    errors.push("首帧图生视频至少需要 1 个图片素材。");
  }

  if (request.mode === "firstLastFrame" && images.length < 2) {
    errors.push("首尾帧模式需要 2 个图片素材。");
  }

  if (request.mode === "multimodal") {
    if (assets.length === 0) {
      errors.push("多模态参考至少需要 1 个图片或视频素材。");
    }

    if (images.length === 0 && videos.length === 0 && audios.length > 0) {
      errors.push("多模态参考不能只包含音频，至少需要 1 个图片或视频素材。");
    }

    if (images.length > 9) {
      errors.push("多模态参考最多支持 9 个图片素材。");
    }

    if (videos.length > 3) {
      errors.push("多模态参考最多支持 3 个视频素材。");
    }

    if (audios.length > 3) {
      errors.push("多模态参考最多支持 3 个音频素材。");
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function buildSeedancePayload(request: GenerateRequest): SeedancePayload {
  const validation = validateGenerateRequest(request);
  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }

  const content: SeedanceContent[] = [
    {
      type: "text",
      text: request.prompt.trim()
    }
  ];

  if (request.mode === "firstFrame") {
    const image = request.assets.find((asset) => asset.kind === "image");
    if (image) content.push(toImageContent(image, "first_frame"));
  }

  if (request.mode === "firstLastFrame") {
    const images = request.assets.filter((asset) => asset.kind === "image");
    content.push(toImageContent(images[0], "first_frame"));
    content.push(toImageContent(images[1], "last_frame"));
  }

  if (request.mode === "multimodal") {
    for (const asset of request.assets) {
      if (asset.kind === "image") content.push(toImageContent(asset, "reference_image"));
      if (asset.kind === "video") content.push(toVideoContent(asset));
      if (asset.kind === "audio") content.push(toAudioContent(asset));
    }
  }

  return {
    model: request.model,
    content,
    resolution: request.resolution,
    ratio: request.ratio,
    duration: request.duration,
    generate_audio: request.generateAudio,
    return_last_frame: request.returnLastFrame,
    watermark: request.watermark
  };
}

function toImageContent(asset: AssetRecord, role: SeedanceImageContent["role"]): SeedanceImageContent {
  return {
    type: "image_url",
    image_url: { url: asset.signedUrl },
    role
  };
}

function toVideoContent(asset: AssetRecord): SeedanceVideoContent {
  return {
    type: "video_url",
    video_url: { url: asset.signedUrl },
    role: "reference_video"
  };
}

function toAudioContent(asset: AssetRecord): SeedanceAudioContent {
  return {
    type: "audio_url",
    audio_url: { url: asset.signedUrl },
    role: "reference_audio"
  };
}
