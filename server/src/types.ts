export type MediaKind = "image" | "video" | "audio";

export type GenerateMode = "text" | "firstFrame" | "firstLastFrame" | "multimodal";

export type SeedanceModel =
  | "doubao-seedance-2-0-260128"
  | "doubao-seedance-2-0-fast-260128";

export type Resolution = "480p" | "720p" | "1080p" | "4k";

export type AspectRatio =
  | "adaptive"
  | "16:9"
  | "9:16"
  | "1:1"
  | "4:3"
  | "3:4"
  | "21:9";

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

export interface GenerateRequest {
  mode: GenerateMode;
  model: SeedanceModel;
  prompt: string;
  assets: AssetRecord[];
  resolution: Resolution;
  ratio: AspectRatio;
  duration: number;
  generateAudio: boolean;
  returnLastFrame: boolean;
  watermark: boolean;
}

export type TaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired";

export interface TaskRecord {
  id: string;
  model: string;
  prompt: string;
  status: TaskStatus;
  userKeyHash: string;
  createdAt: string;
  updatedAt: string;
  request?: GenerateRequest;
  videoUrl?: string;
  lastFrameUrl?: string;
  cosVideoKey?: string;
  cosVideoUrl?: string;
  errorMessage?: string;
}

export interface SeedanceTextContent {
  type: "text";
  text: string;
}

export interface SeedanceImageContent {
  type: "image_url";
  image_url: { url: string };
  role?: "first_frame" | "last_frame" | "reference_image";
}

export interface SeedanceVideoContent {
  type: "video_url";
  video_url: { url: string };
  role: "reference_video";
}

export interface SeedanceAudioContent {
  type: "audio_url";
  audio_url: { url: string };
  role: "reference_audio";
}

export type SeedanceContent =
  | SeedanceTextContent
  | SeedanceImageContent
  | SeedanceVideoContent
  | SeedanceAudioContent;

export interface SeedancePayload {
  model: SeedanceModel;
  content: SeedanceContent[];
  resolution: Resolution;
  ratio: AspectRatio;
  duration: number;
  generate_audio: boolean;
  return_last_frame: boolean;
  watermark: boolean;
}

export interface SeedanceTaskResponse {
  id: string;
  model?: string;
  status: TaskStatus;
  content?: {
    video_url?: string;
    last_frame_url?: string;
  };
  error?: null | {
    code?: string;
    message?: string;
  };
}

export interface ArchiveResult {
  key: string;
  signedUrl: string;
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

export interface ImageGenerateRequest {
  model: GptImageModel;
  prompt: string;
  assets: AssetRecord[];
  n: number;
  size: GptImageSize;
  responseFormat: GptImageResponseFormat;
}

export interface GptImageRequest {
  model: GptImageModel;
  prompt: string;
  image?: string[];
  n: number;
  size: GptImageSize;
  response_format: GptImageResponseFormat;
}

export interface GeneratedImage {
  url?: string;
  b64Json?: string;
  revisedPrompt?: string;
}

export interface GptImageResult {
  images: GeneratedImage[];
}
