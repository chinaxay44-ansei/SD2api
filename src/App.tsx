import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  Cloud,
  Copy,
  Download,
  FileAudio,
  FileVideo,
  Image as ImageIcon,
  LoaderCircle,
  Play,
  RefreshCw,
  Trash2,
  Upload,
  WandSparkles
} from "lucide-react";
import type {
  AspectRatio,
  AssetRecord,
  GenerateMode,
  GeneratedImage,
  GptImageResponseFormat,
  GptImageSize,
  MediaKind,
  Resolution,
  SeedanceModel,
  TaskRecord,
  TaskStatus
} from "./types";

type ToolId = "video" | "image";
type ImageSizeRatio = "auto" | "1:1" | "3:2" | "2:3" | "16:9" | "9:16";
type ImageResolutionChoice = "auto" | "1k" | "1.5k" | "2k" | "4k";

const toolOptions: Array<{ id: ToolId; label: string }> = [
  { id: "video", label: "视频生成" },
  { id: "image", label: "图片生成" }
];

const modeOptions: Array<{ id: GenerateMode; label: string; guidance: string }> = [
  { id: "text", label: "文生视频", guidance: "只需要提示词，模型会自动生成画面与镜头。" },
  { id: "firstFrame", label: "首帧图生", guidance: "至少上传 1 个图片素材，第一张会作为首帧。" },
  { id: "firstLastFrame", label: "首尾帧", guidance: "需要 2 个图片素材，上传顺序即首帧、尾帧。" },
  { id: "multimodal", label: "多模态参考", guidance: "支持图片 0-9、视频 0-3、音频 0-3；不能只有音频。" }
];

const modelOptions: Array<{ id: SeedanceModel; label: string; detail: string }> = [
  {
    id: "doubao-seedance-2-0-260128",
    label: "Seedance 2.0 Standard",
    detail: "质量优先，支持 4k"
  },
  {
    id: "doubao-seedance-2-0-fast-260128",
    label: "Seedance 2.0 Fast",
    detail: "速度优先，最高 720p"
  }
];

const statusLabels: Record<TaskStatus, string> = {
  queued: "排队中",
  running: "生成中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
  expired: "已过期"
};

const kindLabels: Record<MediaKind, string> = {
  image: "图片",
  video: "视频",
  audio: "音频"
};

const samplePrompt = "一段 8 秒的上海雨夜街头电影感镜头，湿润路面反射霓虹，镜头缓慢推进，环境声包含雨声与远处车辆声。";
const imageSamplePrompt = "一张干净高级的产品海报，中央是一只磨砂玻璃香水瓶，柔和棚拍光，浅灰背景，细节清晰。";

const imageRatioOptions: Array<{ id: ImageSizeRatio; label: string; iconRatio: string }> = [
  { id: "auto", label: "自适应", iconRatio: "1 / 1" },
  { id: "1:1", label: "1:1", iconRatio: "1 / 1" },
  { id: "2:3", label: "2:3", iconRatio: "2 / 3" },
  { id: "3:2", label: "3:2", iconRatio: "3 / 2" },
  { id: "16:9", label: "16:9", iconRatio: "16 / 9" },
  { id: "9:16", label: "9:16", iconRatio: "9 / 16" }
];

const imageSizeOptions: Array<{
  id: GptImageSize;
  ratio: ImageSizeRatio;
  resolution: ImageResolutionChoice;
  resolutionLabel: string;
  pixelLabel: string;
}> = [
  { id: "auto", ratio: "auto", resolution: "auto", resolutionLabel: "自动", pixelLabel: "auto" },
  { id: "1024x1024", ratio: "1:1", resolution: "1k", resolutionLabel: "1k", pixelLabel: "1024x1024" },
  { id: "2048x2048", ratio: "1:1", resolution: "2k", resolutionLabel: "2k", pixelLabel: "2048x2048" },
  { id: "1536x1024", ratio: "3:2", resolution: "1.5k", resolutionLabel: "1.5k", pixelLabel: "1536x1024" },
  { id: "1024x1536", ratio: "2:3", resolution: "1.5k", resolutionLabel: "1.5k", pixelLabel: "1024x1536" },
  { id: "2048x1152", ratio: "16:9", resolution: "2k", resolutionLabel: "2k", pixelLabel: "2048x1152" },
  { id: "3840x2160", ratio: "16:9", resolution: "4k", resolutionLabel: "4k", pixelLabel: "3840x2160" },
  { id: "1024x1792", ratio: "9:16", resolution: "1k", resolutionLabel: "1k", pixelLabel: "1024x1792" },
  { id: "2160x3840", ratio: "9:16", resolution: "4k", resolutionLabel: "4k", pixelLabel: "2160x3840" }
];

export default function App() {
  const [tool, setTool] = useState<ToolId>("video");
  const [mode, setMode] = useState<GenerateMode>("text");
  const [model, setModel] = useState<SeedanceModel>("doubao-seedance-2-0-260128");
  const [prompt, setPrompt] = useState(samplePrompt);
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [ratio, setRatio] = useState<AspectRatio>("adaptive");
  const [duration, setDuration] = useState(5);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [returnLastFrame, setReturnLastFrame] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [activeTask, setActiveTask] = useState<TaskRecord | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewAsset, setPreviewAsset] = useState<AssetRecord | null>(null);
  const [imagePrompt, setImagePrompt] = useState(imageSamplePrompt);
  const [imageSize, setImageSize] = useState<GptImageSize>("1024x1024");
  const [imageOutputCount, setImageOutputCount] = useState(1);
  const [imageResponseFormat, setImageResponseFormat] = useState<GptImageResponseFormat>("url");
  const [imageAssets, setImageAssets] = useState<AssetRecord[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [imageMessage, setImageMessage] = useState("");
  const [imageError, setImageError] = useState("");
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isImageGenerating, setIsImageGenerating] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);

  const activeMode = modeOptions.find((option) => option.id === mode) ?? modeOptions[0];
  const previewUrl = activeTask?.cosVideoUrl ?? activeTask?.videoUrl;
  const canPoll = activeTask?.status === "queued" || activeTask?.status === "running";
  const imageCount = assets.filter((asset) => asset.kind === "image").length;
  const videoCount = assets.filter((asset) => asset.kind === "video").length;
  const audioCount = assets.filter((asset) => asset.kind === "audio").length;
  const brandTitle = tool === "video" ? "Seedance 2 视频生成" : "GPT Image 2 图片生成";
  const brandSubtitle =
    tool === "video"
      ? "本地自用控制台 · 后端代理调用 OpenAI Next / Seedance"
      : "本地自用控制台 · 后端代理调用 OpenAI Next / GPT Image 2";
  const selectedImageSizeOption = imageSizeOptions.find((option) => option.id === imageSize) ?? imageSizeOptions[1];
  const availableImageResolutionOptions = useMemo(
    () => imageSizeOptions.filter((option) => option.ratio === selectedImageSizeOption.ratio),
    [selectedImageSizeOption.ratio]
  );

  function selectImageRatio(nextRatio: ImageSizeRatio) {
    const candidates = imageSizeOptions.filter((option) => option.ratio === nextRatio);
    const sameResolution = candidates.find((option) => option.resolution === selectedImageSizeOption.resolution);
    const nextSize = sameResolution ?? candidates[0];
    if (nextSize) setImageSize(nextSize.id);
  }

  function selectImageResolution(nextResolution: ImageResolutionChoice) {
    const nextSize = availableImageResolutionOptions.find((option) => option.resolution === nextResolution);
    if (nextSize) setImageSize(nextSize.id);
  }

  const refreshTasks = useCallback(async (overrideApiKey?: string) => {
    const requestApiKey = (overrideApiKey ?? apiKey).trim();
    if (!requestApiKey) {
      setTasks([]);
      setActiveTask(null);
      return;
    }

    try {
      const data = await fetchJson<{ tasks: TaskRecord[] }>("/api/tasks", withOpenAiNextKey(undefined, requestApiKey));
      setTasks(data.tasks);
    } catch (refreshError) {
      setError(errorMessage(refreshError));
    }
  }, [apiKey]);

  useEffect(() => {
    if (apiKey) void refreshTasks(apiKey);
  }, [apiKey, refreshTasks]);

  useEffect(() => {
    if (!canPoll || !activeTask || !apiKey) return undefined;

    const handle = window.setInterval(async () => {
      try {
        const data = await fetchJson<{ task: TaskRecord }>(
          `/api/tasks/${activeTask.id}`,
          withOpenAiNextKey(undefined, apiKey)
        );
        setActiveTask(data.task);
        setTasks((current) => mergeTask(current, data.task));
      } catch (pollError) {
        setError(errorMessage(pollError));
      }
    }, 4000);

    return () => window.clearInterval(handle);
  }, [activeTask, apiKey, canPoll]);

  const validation = useMemo(() => {
    const issues: string[] = [];
    if (!apiKey) issues.push("请先填写并使用 OpenAI Next API Key。");
    if (!prompt.trim()) issues.push("请输入提示词。");
    if (model === "doubao-seedance-2-0-fast-260128" && (resolution === "1080p" || resolution === "4k")) {
      issues.push("Fast 模型不支持 1080p 或 4k。");
    }
    if (duration !== -1 && (duration < 4 || duration > 15)) {
      issues.push("时长需为 4 到 15 秒，或设置为 -1。");
    }
    if (mode === "firstFrame" && imageCount < 1) issues.push("首帧图生至少需要 1 个图片。");
    if (mode === "firstLastFrame" && imageCount < 2) issues.push("首尾帧需要 2 个图片。");
    if (mode === "multimodal") {
      if (imageCount + videoCount === 0) issues.push("多模态参考至少需要 1 个图片或视频。");
      if (imageCount > 9) issues.push("图片最多 9 个。");
      if (videoCount > 3) issues.push("视频最多 3 个。");
      if (audioCount > 3) issues.push("音频最多 3 个。");
    }
    return issues;
  }, [apiKey, audioCount, duration, imageCount, mode, model, prompt, resolution, videoCount]);

  const imageValidation = useMemo(() => {
    const issues: string[] = [];
    if (!apiKey) issues.push("请先填写并使用 OpenAI Next API Key。");
    if (!imagePrompt.trim()) issues.push("请输入图片提示词。");
    if (!Number.isInteger(imageOutputCount) || imageOutputCount < 1 || imageOutputCount > 4) {
      issues.push("图片数量需为 1 到 4。");
    }
    if (imageAssets.length > 4) issues.push("参考图片最多 4 张。");
    if (imageAssets.some((asset) => asset.kind !== "image")) issues.push("图片生成参考素材只能是图片。");
    return issues;
  }, [apiKey, imageAssets, imageOutputCount, imagePrompt]);

  function handleActivateApiKey() {
    const nextApiKey = apiKeyInput.trim();
    if (!nextApiKey) {
      setError("请先填写 OpenAI Next API Key。");
      setImageError("请先填写 OpenAI Next API Key。");
      return;
    }
    setApiKey(nextApiKey);
    setTasks([]);
    setActiveTask(null);
    setError("");
    setImageError("");
    setMessage("");
    setImageMessage("");
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setIsUploading(true);
    setError("");
    setMessage("");

    try {
      const uploaded: AssetRecord[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const data = await fetchJson<{ asset: AssetRecord }>("/api/assets", {
          method: "POST",
          body: formData
        });
        uploaded.push(data.asset);
      }
      setAssets((current) => [...current, ...uploaded]);
      setMessage(`已上传 ${uploaded.length} 个素材到 COS。`);
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleImageFiles(files: FileList | null) {
    const incoming = Array.from(files ?? []);
    if (incoming.length === 0) return;

    if (incoming.some((file) => !file.type.startsWith("image/"))) {
      setImageError("图片页面只接受图片文件。");
      if (imageFileInputRef.current) imageFileInputRef.current.value = "";
      return;
    }
    if (imageAssets.length + incoming.length > 4) {
      setImageError("参考图片最多 4 张。");
      if (imageFileInputRef.current) imageFileInputRef.current.value = "";
      return;
    }

    setIsImageUploading(true);
    setImageError("");
    setImageMessage("");

    try {
      const uploaded: AssetRecord[] = [];
      for (const file of incoming) {
        const formData = new FormData();
        formData.append("file", file);
        const data = await fetchJson<{ asset: AssetRecord }>("/api/assets", {
          method: "POST",
          body: formData
        });
        uploaded.push(data.asset);
      }
      setImageAssets((current) => [...current, ...uploaded]);
      setImageMessage(`已上传 ${uploaded.length} 张参考图片到 COS。`);
    } catch (uploadError) {
      setImageError(errorMessage(uploadError));
    } finally {
      setIsImageUploading(false);
      if (imageFileInputRef.current) imageFileInputRef.current.value = "";
    }
  }

  async function handleGenerate() {
    if (validation.length > 0) {
      setError(validation[0]);
      return;
    }

    setIsGenerating(true);
    setError("");
    setMessage("任务已提交，等待平台返回任务 ID。");

    try {
      const data = await fetchJson<{ task: TaskRecord }>("/api/generate", withOpenAiNextKey({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          model,
          prompt,
          assets,
          resolution,
          ratio,
          duration,
          generateAudio,
          returnLastFrame,
          watermark
        })
      }, apiKey));
      setActiveTask(data.task);
      setTasks((current) => mergeTask(current, data.task));
      setMessage("任务已创建，系统会自动轮询并在成功后保存输出到 COS。");
    } catch (generateError) {
      setError(errorMessage(generateError));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateImage() {
    if (imageValidation.length > 0) {
      setImageError(imageValidation[0]);
      return;
    }

    setIsImageGenerating(true);
    setImageError("");
    setImageMessage("正在提交图片生成请求。");

    try {
      const data = await fetchJson<{ images: GeneratedImage[] }>("/api/images/generate", withOpenAiNextKey({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-image-2",
          prompt: imagePrompt,
          assets: imageAssets,
          n: imageOutputCount,
          size: imageSize,
          responseFormat: imageResponseFormat
        })
      }, apiKey));
      setGeneratedImages(data.images);
      setImageMessage(`已生成 ${data.images.length} 张图片。`);
    } catch (generateError) {
      setImageError(errorMessage(generateError));
    } finally {
      setIsImageGenerating(false);
    }
  }

  async function refreshActiveTask(taskId: string) {
    try {
      if (!apiKey) {
        setError("请先填写并使用 OpenAI Next API Key。");
        return;
      }
      const data = await fetchJson<{ task: TaskRecord }>(`/api/tasks/${taskId}`, withOpenAiNextKey(undefined, apiKey));
      setActiveTask(data.task);
      setTasks((current) => mergeTask(current, data.task));
      setMessage("任务状态已刷新。");
    } catch (refreshError) {
      setError(errorMessage(refreshError));
    }
  }

  async function copyPreviewUrl() {
    if (!previewUrl) return;
    await navigator.clipboard.writeText(previewUrl);
    setMessage("链接已复制。");
  }

  async function copyGeneratedImage(image: GeneratedImage) {
    const source = generatedImageSource(image);
    if (!source) return;
    await navigator.clipboard.writeText(source);
    setImageMessage("图片链接已复制。");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <WandSparkles size={18} />
          </span>
          <div>
            <h1>{brandTitle}</h1>
            <p>{brandSubtitle}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <form
            className="api-key-control"
            onSubmit={(event) => {
              event.preventDefault();
              handleActivateApiKey();
            }}
          >
            <label>
              <span>OpenAI Next API Key</span>
              <input
                aria-label="OpenAI Next API Key"
                type="password"
                value={apiKeyInput}
                autoComplete="off"
                placeholder="输入平台 API Key"
                onChange={(event) => setApiKeyInput(event.target.value)}
              />
            </label>
            <button type="submit">使用 Key</button>
            <small className={apiKey ? "ready" : ""}>{apiKey ? "已按当前 Key 隔离任务。" : "未设置 Key"}</small>
          </form>
          <nav className="tool-tabs" aria-label="工具类型">
            {toolOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={tool === option.id ? "selected" : ""}
                aria-pressed={tool === option.id}
                onClick={() => setTool(option.id)}
              >
                {option.label}
              </button>
            ))}
          </nav>
          <div className="topbar-status">
            <Cloud size={16} />
            <span>COS: ap-shanghai</span>
          </div>
        </div>
      </header>

      {tool === "video" ? (
      <section className="workspace" aria-label="视频生成工作台">
        <form
          className="panel generator-panel"
          onSubmit={(event) => {
            event.preventDefault();
            void handleGenerate();
          }}
        >
          <div className="panel-heading">
            <div>
              <h2>生成设置</h2>
              <p>{activeMode.guidance}</p>
            </div>
            <button className="icon-button" type="button" title="刷新任务" onClick={() => void refreshTasks()}>
              <RefreshCw size={17} />
            </button>
          </div>

          <div className="segmented" aria-label="生成模式">
            {modeOptions.map((option) => (
              <button
                type="button"
                key={option.id}
                className={mode === option.id ? "selected" : ""}
                aria-pressed={mode === option.id}
                onClick={() => setMode(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="field">
            <span>模型</span>
            <select value={model} onChange={(event) => setModel(event.target.value as SeedanceModel)}>
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} - {option.detail}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>提示词</span>
            <MentionTextarea
              label="提示词"
              value={prompt}
              onChange={setPrompt}
              rows={7}
              placeholder="描述你要生成的视频镜头、主体、动作、声音和风格。"
            />
          </label>

          <div className="settings-grid">
            <label className="field">
              <span>分辨率</span>
              <select value={resolution} onChange={(event) => setResolution(event.target.value as Resolution)}>
                <option value="480p">480p</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="4k">4k</option>
              </select>
            </label>

            <label className="field">
              <span>画幅比例</span>
              <select value={ratio} onChange={(event) => setRatio(event.target.value as AspectRatio)}>
                <option value="adaptive">adaptive</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
                <option value="4:3">4:3</option>
                <option value="3:4">3:4</option>
                <option value="21:9">21:9</option>
              </select>
            </label>

            <label className="field">
              <span>时长</span>
              <input
                type="number"
                min="-1"
                max="15"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="toggle-row">
            <Toggle label="生成音频" checked={generateAudio} onChange={setGenerateAudio} />
            <Toggle label="返回尾帧" checked={returnLastFrame} onChange={setReturnLastFrame} />
            <Toggle label="水印" checked={watermark} onChange={setWatermark} />
          </div>

          {validation.length > 0 && (
            <div className="inline-warning">
              <AlertCircle size={16} />
              <span>{validation[0]}</span>
            </div>
          )}

          <button className="primary-action" type="submit" disabled={isGenerating || isUploading}>
            {isGenerating ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}
            <span>{isGenerating ? "提交中" : "生成视频"}</span>
          </button>
        </form>

        <section className="results-column">
          <div className="panel asset-panel">
            <div className="panel-heading">
              <div>
                <h2>参考素材</h2>
                <p>上传后以当前方格顺序提交给 Seedance，拖拽可调整顺序。</p>
              </div>
            </div>

            <div className="asset-dropzone compact">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                onChange={(event) => void handleFiles(event.currentTarget.files)}
              />
              <Upload size={20} />
              <div>
                <strong>上传素材</strong>
                <span>支持图片、视频和音频；点击方格可预览。</span>
              </div>
            </div>

            <AssetList
              assets={assets}
              onPreview={setPreviewAsset}
              onRemove={(id) => setAssets((current) => current.filter((asset) => asset.id !== id))}
              onReorder={(draggedId, targetId) => setAssets((current) => reorderAssets(current, draggedId, targetId))}
            />
          </div>

          <div className="panel status-panel">
            <div className="panel-heading">
              <div>
                <h2>任务状态</h2>
                <p>{activeTask ? `任务 ${activeTask.id}` : "提交任务后会在这里显示轮询进度。"}</p>
              </div>
              {activeTask && (
                <button className="icon-button" type="button" title="刷新当前任务" onClick={() => void refreshActiveTask(activeTask.id)}>
                  <RefreshCw size={17} />
                </button>
              )}
            </div>

            <StatusTimeline status={activeTask?.status} />

            <div className="video-stage">
              {previewUrl ? (
                <video src={previewUrl} controls playsInline />
              ) : (
                <div className="empty-preview">
                  <FileVideo size={36} />
                  <span>生成完成后显示视频预览</span>
                </div>
              )}
            </div>

            <div className="result-actions">
              <button type="button" onClick={() => void copyPreviewUrl()} disabled={!previewUrl}>
                <Copy size={16} />
                <span>复制链接</span>
              </button>
              <a className={!previewUrl ? "disabled-link" : ""} href={previewUrl ?? "#"} target="_blank" rel="noreferrer">
                <Download size={16} />
                <span>下载</span>
              </a>
            </div>

            {(message || error) && (
              <div className={error ? "notice error" : "notice"}>
                {error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                <span>{error || message}</span>
              </div>
            )}
          </div>

          <div className="panel history-panel">
            <div className="panel-heading compact">
              <h2>最近任务</h2>
              <button className="icon-button" type="button" title="刷新最近任务" onClick={() => void refreshTasks()}>
                <RefreshCw size={17} />
              </button>
            </div>
            <TaskHistory tasks={tasks} activeId={activeTask?.id} onSelect={setActiveTask} />
          </div>
        </section>
      </section>
      ) : (
      <section className="workspace" aria-label="图片生成工作台">
        <form
          className="panel generator-panel"
          onSubmit={(event) => {
            event.preventDefault();
            void handleGenerateImage();
          }}
        >
          <div className="panel-heading">
            <div>
              <h2>图片设置</h2>
              <p>模型固定为 gpt-image-2，参考图片通过 COS 签名 URL 传入。</p>
            </div>
          </div>

          <label className="field">
            <span>模型</span>
            <input value="gpt-image-2" readOnly />
          </label>

          <label className="field">
            <span>图片提示词</span>
            <MentionTextarea
              label="图片提示词"
              value={imagePrompt}
              onChange={setImagePrompt}
              rows={7}
              placeholder="描述主体、构图、材质、光线、背景和风格。"
            />
          </label>

          <div className="image-size-control">
            <div className="size-control-heading">
              <span>比例</span>
              <strong>{selectedImageSizeOption.ratio === "auto" ? "自动尺寸" : selectedImageSizeOption.pixelLabel}</strong>
            </div>
            <div className="image-ratio-grid" role="group" aria-label="图片比例">
              {imageRatioOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={selectedImageSizeOption.ratio === option.id ? "ratio-option selected" : "ratio-option"}
                  aria-pressed={selectedImageSizeOption.ratio === option.id}
                  onClick={() => selectImageRatio(option.id)}
                >
                  <span className="ratio-icon" style={{ aspectRatio: option.iconRatio }} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>

            <div className="size-control-heading">
              <span>分辨率</span>
              <strong>{selectedImageSizeOption.pixelLabel}</strong>
            </div>
            <div className="image-resolution-grid" role="group" aria-label="图片分辨率">
              {availableImageResolutionOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={selectedImageSizeOption.id === option.id ? "resolution-option selected" : "resolution-option"}
                  aria-pressed={selectedImageSizeOption.id === option.id}
                  onClick={() => selectImageResolution(option.resolution)}
                >
                  <strong>{option.resolutionLabel}</strong>
                  <span>{option.pixelLabel}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-grid">

            <label className="field">
              <span>数量</span>
              <input
                type="number"
                min="1"
                max="4"
                value={imageOutputCount}
                onChange={(event) => setImageOutputCount(Number(event.target.value))}
              />
            </label>

            <label className="field">
              <span>返回格式</span>
              <select
                value={imageResponseFormat}
                onChange={(event) => setImageResponseFormat(event.target.value as GptImageResponseFormat)}
              >
                <option value="url">url</option>
                <option value="b64_json">b64_json</option>
              </select>
            </label>
          </div>

          {imageValidation.length > 0 && (
            <div className="inline-warning">
              <AlertCircle size={16} />
              <span>{imageValidation[0]}</span>
            </div>
          )}

          <button className="primary-action" type="submit" disabled={isImageGenerating || isImageUploading}>
            {isImageGenerating ? <LoaderCircle className="spin" size={18} /> : <ImageIcon size={18} />}
            <span>{isImageGenerating ? "生成中" : "生成图片"}</span>
          </button>
        </form>

        <section className="results-column">
          <div className="panel assets-panel">
            <div className="panel-heading compact">
              <h2>参考图片</h2>
              <span className="asset-counter">{imageAssets.length} / 4</span>
            </div>

            <div className="asset-dropzone">
              <input
                ref={imageFileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(event) => void handleImageFiles(event.currentTarget.files)}
              />
              <Upload size={20} />
              <div>
                <strong>上传参考图</strong>
                <span>最多 4 张，点击方格可预览，拖动可调整顺序。</span>
              </div>
            </div>

            <AssetList
              assets={imageAssets}
              emptyText="还没有参考图片。纯文生图可以不上传。"
              onPreview={setPreviewAsset}
              onRemove={(id) => setImageAssets((current) => current.filter((asset) => asset.id !== id))}
              onReorder={(draggedId, targetId) => setImageAssets((current) => reorderAssets(current, draggedId, targetId))}
            />
          </div>

          <div className="panel status-panel">
            <div className="panel-heading">
              <div>
                <h2>生成结果</h2>
                <p>{generatedImages.length > 0 ? `${generatedImages.length} 张图片已返回` : "提交后在这里预览图片。"}</p>
              </div>
            </div>

            <GeneratedImageGrid images={generatedImages} onCopy={(image) => void copyGeneratedImage(image)} />

            {(imageMessage || imageError) && (
              <div className={imageError ? "notice error" : "notice"}>
                {imageError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                <span>{imageError || imageMessage}</span>
              </div>
            )}
          </div>

          <div className="panel history-panel">
            <div className="panel-heading compact">
              <h2>请求摘要</h2>
            </div>
            <div className="request-summary">
              <div>
                <span>模型</span>
                <strong>gpt-image-2</strong>
              </div>
              <div>
                <span>参考图</span>
                <strong>{imageAssets.length} / 4</strong>
              </div>
              <div>
                <span>返回</span>
                <strong>{imageResponseFormat}</strong>
              </div>
            </div>
          </div>
        </section>
      </section>
      )}
      {previewAsset && <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />}
    </main>
  );
}

function Toggle(props: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}

function MentionTextarea(props: {
  label: string;
  value: string;
  onChange(value: string): void;
  rows: number;
  placeholder: string;
}) {
  const [scrollTop, setScrollTop] = useState(0);

  return (
    <div className="mention-textarea">
      <div className="mention-highlight-layer" aria-hidden="true">
        <div className="mention-highlight-content" style={{ transform: `translateY(-${scrollTop}px)` }}>
          {renderMentionHighlights(props.value)}
          {props.value.endsWith("\n") && "\u00A0"}
        </div>
      </div>
      <textarea
        aria-label={props.label}
        className="mention-textarea-input"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        rows={props.rows}
        placeholder={props.placeholder}
      />
    </div>
  );
}

function renderMentionHighlights(value: string) {
  const nodes: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < value.length) {
    const atIndex = value.indexOf("@", index);
    if (atIndex === -1) {
      nodes.push(value.slice(index));
      break;
    }
    if (atIndex > index) nodes.push(value.slice(index, atIndex));

    const highlight = value.slice(atIndex, Math.min(value.length, atIndex + 4));
    nodes.push(
      <span className="mention-highlight" key={`mention-${key++}`}>
        {highlight}
      </span>
    );
    index = atIndex + highlight.length;
  }

  return nodes.length > 0 ? nodes : "\u00A0";
}

function AssetList(props: {
  assets: AssetRecord[];
  emptyText?: string;
  onPreview(asset: AssetRecord): void;
  onRemove(id: string): void;
  onReorder?(draggedId: string, targetId: string): void;
}) {
  const draggedIdRef = useRef<string | null>(null);

  if (props.assets.length === 0) {
    return (
      <div className="asset-empty">
        <Clipboard size={16} />
        <span>{props.emptyText ?? "还没有参考素材。文生视频可以不上传。"}</span>
      </div>
    );
  }

  const orderedLabels = assetOrderLabels(props.assets);

  return (
    <ul className="asset-grid">
      {props.assets.map((asset) => (
        <li
          key={asset.id}
          data-testid={`asset-card-${asset.id}`}
          className="asset-card"
          role="button"
          tabIndex={0}
          draggable={Boolean(props.onReorder)}
          onClick={() => props.onPreview(asset)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              props.onPreview(asset);
            }
          }}
          onDragStart={(event) => {
            draggedIdRef.current = asset.id;
            if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(event) => {
            if (!props.onReorder || draggedIdRef.current === asset.id) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const draggedId = draggedIdRef.current;
            draggedIdRef.current = null;
            if (draggedId && draggedId !== asset.id) props.onReorder?.(draggedId, asset.id);
          }}
          onDragEnd={() => {
            draggedIdRef.current = null;
          }}
        >
          <div className="asset-thumb">
            <AssetPreviewThumb asset={asset} />
            <span className="asset-order-badge">{orderedLabels.get(asset.id)}</span>
          </div>
          <div className="asset-card-meta">
            <strong>{asset.originalName ?? asset.key.split("/").at(-1)}</strong>
            <span>
              {kindLabels[asset.kind]} · {formatBytes(asset.size)}
            </span>
          </div>
          <button
            type="button"
            className="asset-remove-button"
            title="移除素材"
            onClick={(event) => {
              event.stopPropagation();
              props.onRemove(asset.id);
            }}
          >
            <Trash2 size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function AssetPreviewThumb(props: { asset: AssetRecord }) {
  if (props.asset.kind === "image") {
    return <img src={props.asset.signedUrl} alt="" />;
  }
  if (props.asset.kind === "video") {
    return <video src={props.asset.signedUrl} muted playsInline preload="metadata" />;
  }
  return (
    <div className="asset-audio-thumb">
      <FileAudio size={30} />
      <span>音频</span>
    </div>
  );
}

function AssetPreviewModal(props: { asset: AssetRecord; onClose(): void }) {
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <section
        className="preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label="素材预览"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-heading compact">
          <div>
            <h2>素材预览</h2>
            <p>
              {kindLabels[props.asset.kind]} · {props.asset.originalName ?? props.asset.key.split("/").at(-1)}
            </p>
          </div>
          <button className="icon-button" type="button" title="关闭预览" aria-label="关闭预览" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="preview-stage">
          {props.asset.kind === "image" && <img src={props.asset.signedUrl} alt={props.asset.originalName ?? "素材预览"} />}
          {props.asset.kind === "video" && <video src={props.asset.signedUrl} controls playsInline />}
          {props.asset.kind === "audio" && <audio src={props.asset.signedUrl} controls />}
        </div>
      </section>
    </div>
  );
}

function GeneratedImageGrid(props: { images: GeneratedImage[]; onCopy(image: GeneratedImage): void }) {
  if (props.images.length === 0) {
    return (
      <div className="image-empty">
        <ImageIcon size={36} />
        <span>生成完成后显示图片预览</span>
      </div>
    );
  }

  return (
    <div className="image-result-grid">
      {props.images.map((image, index) => {
        const source = generatedImageSource(image);
        return (
          <article className="image-result-card" key={`${source ?? "image"}-${index}`}>
            {source ? <img src={source} alt={`生成结果 ${index + 1}`} /> : <div className="image-missing">无可用图片</div>}
            <div className="image-result-meta">
              <strong>结果 {index + 1}</strong>
              {image.revisedPrompt && <span>{truncate(image.revisedPrompt, 80)}</span>}
            </div>
            <div className="result-actions compact">
              <button type="button" onClick={() => props.onCopy(image)} disabled={!source}>
                <Copy size={16} />
                <span>复制</span>
              </button>
              <a
                className={!source ? "disabled-link" : ""}
                href={source ?? "#"}
                download={image.b64Json ? `gpt-image-2-${index + 1}.png` : undefined}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={16} />
                <span>下载</span>
              </a>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function KindIcon(props: { kind: MediaKind }) {
  if (props.kind === "image") return <ImageIcon size={17} />;
  if (props.kind === "audio") return <FileAudio size={17} />;
  return <FileVideo size={17} />;
}

function StatusTimeline(props: { status?: TaskStatus }) {
  const steps: Array<{ id: TaskStatus; label: string }> = [
    { id: "queued", label: "排队" },
    { id: "running", label: "生成" },
    { id: "succeeded", label: "保存" }
  ];
  const activeIndex = props.status === "running" ? 1 : props.status === "succeeded" ? 2 : 0;

  return (
    <ol className="timeline">
      {steps.map((step, index) => (
        <li key={step.id} className={index <= activeIndex && props.status ? "active" : ""}>
          <span>{index < activeIndex || props.status === "succeeded" ? <CheckCircle2 size={14} /> : index === activeIndex && props.status ? <LoaderCircle className="spin" size={14} /> : null}</span>
          <strong>{step.label}</strong>
        </li>
      ))}
    </ol>
  );
}

function TaskHistory(props: { tasks: TaskRecord[]; activeId?: string; onSelect(task: TaskRecord): void }) {
  if (props.tasks.length === 0) {
    return <div className="empty-history">暂无任务历史</div>;
  }

  return (
    <div className="task-table">
      {props.tasks.map((task) => (
        <button
          key={task.id}
          type="button"
          className={task.id === props.activeId ? "task-row active" : "task-row"}
          onClick={() => props.onSelect(task)}
        >
          <span className={`status-dot ${task.status}`} />
          <span className="task-main">
            <strong>{truncate(task.prompt || task.id, 34)}</strong>
            <small>{task.model.includes("fast") ? "Fast" : "Standard"} · {new Date(task.updatedAt).toLocaleString()}</small>
          </span>
          <span className="task-status">{statusLabels[task.status] ?? task.status}</span>
        </button>
      ))}
    </div>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.error ?? data?.errors?.[0] ?? `${response.status} ${response.statusText}`);
  }
  return data as T;
}

function withOpenAiNextKey(init: RequestInit | undefined, apiKey: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("x-openai-next-key", apiKey);
  return {
    ...init,
    headers
  };
}

function mergeTask(tasks: TaskRecord[], task: TaskRecord): TaskRecord[] {
  const without = tasks.filter((item) => item.id !== task.id);
  return [task, ...without].slice(0, 50);
}

function reorderAssets(assets: AssetRecord[], draggedId: string, targetId: string): AssetRecord[] {
  const draggedIndex = assets.findIndex((asset) => asset.id === draggedId);
  const targetIndex = assets.findIndex((asset) => asset.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return assets;

  const next = [...assets];
  const [dragged] = next.splice(draggedIndex, 1);
  const adjustedTargetIndex = next.findIndex((asset) => asset.id === targetId);
  next.splice(adjustedTargetIndex, 0, dragged);
  return next;
}

function assetOrderLabels(assets: AssetRecord[]): Map<string, string> {
  const counts: Record<MediaKind, number> = { image: 0, video: 0, audio: 0 };
  const labels = new Map<string, string>();
  for (const asset of assets) {
    counts[asset.kind] += 1;
    labels.set(asset.id, `${kindLabels[asset.kind]} ${counts[asset.kind]}`);
  }
  return labels;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败。";
}

function generatedImageSource(image: GeneratedImage): string | undefined {
  if (image.url) return image.url;
  if (image.b64Json) return `data:image/png;base64,${image.b64Json}`;
  return undefined;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
