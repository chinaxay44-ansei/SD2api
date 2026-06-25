export type MediaKind = "image" | "video" | "audio";
export type GenerateMode = "text" | "firstFrame" | "firstLastFrame" | "multimodal";
export type SeedanceModel =
  | "doubao-seedance-2-0-260128"
  | "doubao-seedance-2-0-fast-260128";
export type Resolution = "480p" | "720p" | "1080p" | "4k";
export type AspectRatio = "adaptive" | "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9";
export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";

export interface AssetRecord {
  id: string;
  kind: MediaKind;
  key: string;
  mimeType: string;
  size: number;
  signedUrl: string;
  createdAt: string;
  originalName?: string;
}

export interface TaskRecord {
  id: string;
  model: string;
  prompt: string;
  status: TaskStatus;
  userKeyHash?: string;
  createdAt: string;
  updatedAt: string;
  videoUrl?: string;
  lastFrameUrl?: string;
  cosVideoKey?: string;
  cosVideoUrl?: string;
  errorMessage?: string;
}

export type GptImageModel = "gpt-image-2";
export type GptImageSize =
  | "1024x1024"
  | "1536x1024"
  | "1024x1536"
  | "1024x1792"
  | "2048x2048"
  | "2048x1152"
  | "3840x2160"
  | "2160x3840"
  | "auto";
export type GptImageResponseFormat = "url" | "b64_json";

export interface GeneratedImage {
  url?: string;
  b64Json?: string;
  revisedPrompt?: string;
}
