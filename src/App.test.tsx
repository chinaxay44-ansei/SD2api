import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const userApiKey = "user-key-a";
const apiKeyStorageKey = "sd2api.openAiNextApiKey";

describe("App", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders the two-column Seedance generation workspace without exposing secrets", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ tasks: [] }))));

    const { container } = render(<App />);

    expect(await screen.findByText("Seedance 2 视频生成")).toBeInTheDocument();
    expect(screen.getByLabelText("OpenAI Next API Key")).toBeInTheDocument();
    expect(screen.getByLabelText("提示词")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生成视频/ })).toBeInTheDocument();
    expect(screen.getByText("任务状态")).toBeInTheDocument();
    expect(screen.getByText("最近任务")).toBeInTheDocument();
    expect(screen.queryByText("生成设置")).not.toBeInTheDocument();
    expect(screen.queryByText("只需要提示词，模型会自动生成画面与镜头。")).not.toBeInTheDocument();
    expect(screen.queryByText(/本地自用控制台/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("返回尾帧")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("水印")).not.toBeInTheDocument();
    expect(screen.queryByText("COS: ap-shanghai")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("sk-");
    expect(container.textContent).not.toContain("SecretKey");
    expect(container.textContent).not.toContain("AKID");

    vi.unstubAllGlobals();
  });

  it("defaults Seedance generation mode to multimodal reference", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ tasks: [] }))));

    render(<App />);

    expect(await screen.findByRole("button", { name: "多模态参考" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "文生视频" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("还没有参考素材。多模态参考至少上传 1 个图片或视频。")).toBeInTheDocument();
    expect(screen.queryByText("还没有参考素材。文生视频可以不上传。")).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("restores the OpenAI Next API key from browser storage and loads user tasks", async () => {
    window.localStorage.setItem(apiKeyStorageKey, userApiKey);
    const fetchMock = vi.fn(async () => jsonResponse({ tasks: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(screen.getByLabelText("OpenAI Next API Key")).toHaveValue(userApiKey);
    expect(await screen.findByText("已按当前 Key 隔离任务。")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks",
        expect.objectContaining({
          headers: expect.any(Headers)
        })
      );
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("x-openai-next-key")).toBe(userApiKey);

    vi.unstubAllGlobals();
  });

  it("loads user-scoped task history only after the API key is activated", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ tasks: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(fetchMock).not.toHaveBeenCalled();

    await activateApiKey();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks",
        expect.objectContaining({
          headers: expect.any(Headers)
        })
      );
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("x-openai-next-key")).toBe(userApiKey);

    vi.unstubAllGlobals();
  });

  it("uses a video duration dropdown defaulting to 15 seconds", async () => {
    let submittedBody: any;
    vi.stubGlobal(
      "fetch",
      createAssetFetchMock((body) => {
        submittedBody = body;
      })
    );

    render(<App />);
    await activateApiKey();
    fireEvent.click(screen.getByRole("button", { name: "文生视频" }));

    const durationSelect = screen.getByRole("combobox", { name: "时长" });
    expect(durationSelect).toHaveValue("15");
    expect(within(durationSelect).getByRole("option", { name: "15 秒" })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "时长" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /生成视频/ }));

    await waitFor(() => {
      expect(submittedBody?.duration).toBe(15);
    });

    vi.unstubAllGlobals();
  });

  it("allows concurrent Seedance generation submissions", async () => {
    let releaseFirst: (() => void) | undefined;
    const submittedPrompts: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/tasks") return jsonResponse({ tasks: [] });
      if (url === "/api/generate") {
        const body = JSON.parse(String(init?.body));
        submittedPrompts.push(body.prompt);
        if (submittedPrompts.length === 1) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        return jsonResponse({
          task: {
            id: `video-task-${submittedPrompts.length}`,
            taskType: "video",
            model: body.model,
            prompt: body.prompt,
            status: "queued",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:00.000Z"
          }
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await activateApiKey();
    fireEvent.click(screen.getByRole("button", { name: "文生视频" }));
    const submitButton = screen.getByRole("button", { name: /生成视频/ });

    fireEvent.click(submitButton);
    expect(await screen.findByText("提交中 1")).toBeInTheDocument();
    expect(submitButton).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText("提示词"), { target: { value: "第二个并发视频任务" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(submittedPrompts).toHaveLength(2);
    });
    releaseFirst?.();
    await screen.findByText(/任务 video-task-1|任务 video-task-2/);

    vi.unstubAllGlobals();
  });

  it("resumes unfinished Seedance tasks from the current API key history", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/tasks") {
        return jsonResponse({
          tasks: [
            {
              id: "seedance-resume-1",
              taskType: "video",
              model: "doubao-seedance-2-0-260128",
              prompt: "上次未完成的视频任务",
              status: "queued",
              createdAt: "2026-06-25T00:00:00.000Z",
              updatedAt: "2026-06-25T00:00:00.000Z"
            }
          ]
        });
      }
      if (url === "/api/tasks/seedance-resume-1") {
        return jsonResponse({
          task: {
            id: "seedance-resume-1",
            taskType: "video",
            model: "doubao-seedance-2-0-260128",
            prompt: "上次未完成的视频任务",
            status: "succeeded",
            videoUrl: "https://platform.example/resume.mp4",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:01:00.000Z"
          }
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<App />);
    await activateApiKey();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/tasks/seedance-resume-1", expect.objectContaining({ headers: expect.any(Headers) }));
    });
    expect(await screen.findByText(/已恢复 1 个未完成视频任务/)).toBeInTheDocument();
    const videoPreview = container.querySelector(".video-stage video");
    expect(videoPreview).toHaveAttribute("src", "https://platform.example/resume.mp4");
    expect(videoPreview).not.toHaveAttribute("autoplay");
    expect(videoPreview).toHaveAttribute("preload", "metadata");

    vi.unstubAllGlobals();
  });

  it("does not keep polling succeeded Seedance tasks just because they lack COS URLs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/tasks") {
        return jsonResponse({
          tasks: [
            {
              id: "seedance-done-temp-url",
              taskType: "video",
              model: "doubao-seedance-2-0-260128",
              prompt: "已完成的平台临时视频",
              status: "succeeded",
              videoUrl: "https://platform.example/done.mp4",
              createdAt: "2026-06-25T00:00:00.000Z",
              updatedAt: "2026-06-25T00:01:00.000Z"
            }
          ]
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await activateApiKey();

    await screen.findByText(/已完成的平台临时视频/);
    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalledWith("/api/tasks/seedance-done-temp-url", expect.anything());
    });

    vi.unstubAllGlobals();
  });

  it("polls multiple unfinished Seedance tasks concurrently", async () => {
    let releaseFirstPoll: (() => void) | undefined;
    const pollStarted: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/tasks") {
        return jsonResponse({
          tasks: ["resume-a", "resume-b"].map((id) => ({
            id,
            taskType: "video",
            model: "doubao-seedance-2-0-260128",
            prompt: id,
            status: "queued",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:00.000Z"
          }))
        });
      }
      if (url === "/api/tasks/resume-a") {
        pollStarted.push("resume-a");
        await new Promise<void>((resolve) => {
          releaseFirstPoll = resolve;
        });
        return jsonResponse({
          task: {
            id: "resume-a",
            taskType: "video",
            model: "doubao-seedance-2-0-260128",
            prompt: "resume-a",
            status: "running",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:01.000Z"
          }
        });
      }
      if (url === "/api/tasks/resume-b") {
        pollStarted.push("resume-b");
        return jsonResponse({
          task: {
            id: "resume-b",
            taskType: "video",
            model: "doubao-seedance-2-0-260128",
            prompt: "resume-b",
            status: "running",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:01.000Z"
          }
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await activateApiKey();

    await waitFor(() => {
      expect(pollStarted).toEqual(["resume-a", "resume-b"]);
    });
    releaseFirstPoll?.();

    vi.unstubAllGlobals();
  });

  it("manually refreshes the active Seedance task status", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/tasks") return jsonResponse({ tasks: [] });
      if (url === "/api/generate") {
        const body = JSON.parse(String(init?.body));
        return jsonResponse({
          task: {
            id: "task-refresh",
            taskType: "video",
            model: body.model,
            prompt: body.prompt,
            status: "succeeded",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:00.000Z"
          }
        });
      }
      if (url === "/api/tasks/task-refresh") {
        return jsonResponse({
          task: {
            id: "task-refresh",
            taskType: "video",
            model: "doubao-seedance-2-0-260128",
            prompt: "刷新状态测试",
            status: "succeeded",
            videoUrl: "https://platform.example/task-refresh.mp4",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:01:00.000Z"
          }
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await activateApiKey();
    fireEvent.click(screen.getByRole("button", { name: "文生视频" }));
    fireEvent.click(screen.getByRole("button", { name: /生成视频/ }));

    expect(await screen.findByText(/任务 task-refresh/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "刷新状态" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-refresh",
        expect.objectContaining({
          headers: expect.any(Headers)
        })
      );
    });
    const taskCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/tasks/task-refresh");
    expect(new Headers(taskCall?.[1]?.headers).get("x-openai-next-key")).toBe(userApiKey);
    expect(await screen.findByText("任务状态已刷新。")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("manually queries a Seedance task id and displays the remote failure reason", async () => {
    let submittedKey: string | null = null;
    let submittedBody: any;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/tasks") return jsonResponse({ tasks: [] });
      if (url === "/api/tasks/query") {
        submittedKey = new Headers(init?.headers).get("x-openai-next-key");
        submittedBody = JSON.parse(String(init?.body));
        return jsonResponse({
          task: {
            id: "task_manualfailed",
            taskType: "video",
            model: "doubao-seedance-2-0-260128",
            prompt: "手动查询 task_manualfailed",
            status: "failed",
            errorMessage: "Height must be between 300px and 6000px.",
            createdAt: "2026-06-27T00:00:00.000Z",
            updatedAt: "2026-06-27T00:00:00.000Z"
          }
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await activateApiKey();
    fireEvent.change(screen.getByLabelText("任务 ID"), { target: { value: "task_manualfailed" } });
    fireEvent.click(screen.getByRole("button", { name: "查询任务" }));

    await waitFor(() => {
      expect(submittedBody).toEqual({ id: "task_manualfailed" });
    });
    expect(submittedKey).toBe(userApiKey);
    expect(await screen.findByText("任务 task_manualfailed")).toBeInTheDocument();
    expect(screen.getByText("Height must be between 300px and 6000px.")).toBeInTheDocument();
    expect(screen.getByText("手动查询完成：失败。")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("switches video generation modes without showing helper copy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ tasks: [] }))));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "首尾帧" }));

    expect(screen.getByRole("button", { name: "首尾帧" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("需要 2 个图片素材，上传顺序即首帧、尾帧。")).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("switches to the GPT image generation workspace without exposing secrets", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ tasks: [] }))));

    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "图片生成" }));

    expect(screen.getByRole("heading", { name: "GPT Image 2 图片生成" })).toBeInTheDocument();
    expect(screen.getByLabelText("图片提示词")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生成图片/ })).toBeInTheDocument();
    expect(screen.getByText("参考图片")).toBeInTheDocument();
    expect(screen.queryByText("本地自用控制台 · 后端代理调用 OpenAI Next / GPT Image 2")).not.toBeInTheDocument();
    expect(screen.queryByText("图片设置")).not.toBeInTheDocument();
    expect(screen.queryByText("模型固定为 gpt-image-2，参考图片通过 COS 签名 URL 传入。")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("返回格式")).not.toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll('[aria-label="图片生成工作台"] .panel-heading h2')).map((heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["参考图片", "生成结果", "最近图片任务"]);
    expect(container.querySelector(".results-column .panel:first-child h2")).toHaveTextContent("参考图片");
    expect(container.textContent).not.toContain("sk-");
    expect(container.textContent).not.toContain("SecretKey");
    expect(container.textContent).not.toContain("AKID");

    vi.unstubAllGlobals();
  });

  it("renders @ plus the next three characters as green highlighted text in prompt inputs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ tasks: [] }))));

    const { container } = render(<App />);
    fireEvent.change(await screen.findByLabelText("提示词"), {
      target: { value: "镜头跟随 @机器人 穿过雨夜街道" }
    });

    const highlight = container.querySelector(".mention-highlight");
    expect(highlight).toHaveTextContent("@机器人");

    vi.unstubAllGlobals();
  });

  it("uploads Seedance files directly to COS with signed PUT URLs", async () => {
    let presignBody: any;
    let presignKey: string | null = null;
    let uploadInit: RequestInit | undefined;
    const file = new File(["video-bytes"], "clip.mp4", { type: "video/mp4" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/tasks") return jsonResponse({ tasks: [] });
      if (url === "/api/assets/presign") {
        presignBody = JSON.parse(String(init?.body));
        presignKey = new Headers(init?.headers).get("x-openai-next-key");
        return jsonResponse({
          asset: buildAssetRecord(file),
          upload: {
            method: "PUT",
            url: "https://cos-upload.example/clip.mp4?sign=1",
            headers: { "Content-Type": "video/mp4" }
          }
        });
      }
      if (url === "https://cos-upload.example/clip.mp4?sign=1") {
        uploadInit = init;
        return new Response("", { status: 200 });
      }
      if (url === "/api/assets") throw new Error("multipart endpoint should not be used");
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<App />);
    await activateApiKey();
    await uploadFiles(container, [file]);

    expect(presignKey).toBe(userApiKey);
    expect(presignBody).toEqual({ originalName: "clip.mp4", mimeType: "video/mp4", size: file.size });
    expect(uploadInit?.method).toBe("PUT");
    expect(new Headers(uploadInit?.headers).get("Content-Type")).toBe("video/mp4");
    expect(uploadInit?.body).toBe(file);
    expect(screen.getByText("视频 1")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/assets", expect.anything());

    vi.unstubAllGlobals();
  });

  it("uploads GPT image reference files directly to COS with signed PUT URLs", async () => {
    let uploadCalled = false;
    const file = new File(["image-bytes"], "reference.png", { type: "image/png" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/tasks") return jsonResponse({ tasks: [] });
      if (url === "/api/assets/presign") {
        return jsonResponse({
          asset: buildAssetRecord(file),
          upload: {
            method: "PUT",
            url: "https://cos-upload.example/reference.png?sign=1",
            headers: { "Content-Type": "image/png" }
          }
        });
      }
      if (url === "https://cos-upload.example/reference.png?sign=1") {
        uploadCalled = init?.method === "PUT" && init.body === file;
        return new Response("", { status: 200 });
      }
      if (url === "/api/assets") throw new Error("multipart endpoint should not be used");
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<App />);
    await activateApiKey();
    fireEvent.click(screen.getByRole("button", { name: "图片生成" }));
    await uploadFiles(container, [file]);

    expect(uploadCalled).toBe(true);
    expect(screen.getByText("图片 1")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/assets", expect.anything());

    vi.unstubAllGlobals();
  });

  it("labels uploaded Seedance assets with kind-specific order numbers", async () => {
    vi.stubGlobal("fetch", createAssetFetchMock());

    const { container } = render(<App />);
    await activateApiKey();
    await uploadFiles(container, [
      new File(["image"], "cover.png", { type: "image/png" }),
      new File(["video"], "clip.mp4", { type: "video/mp4" }),
      new File(["audio"], "voice.mp3", { type: "audio/mpeg" })
    ]);

    expect(await screen.findByText("图片 1")).toBeInTheDocument();
    expect(screen.getByText("视频 1")).toBeInTheDocument();
    expect(screen.getByText("音频 1")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("moves the Seedance asset uploader above task status and renders uploaded assets as square cards", async () => {
    vi.stubGlobal("fetch", createAssetFetchMock());

    const { container } = render(<App />);
    expect(container.querySelector(".results-column .panel h2")).toHaveTextContent("参考素材");
    await activateApiKey();

    await uploadFiles(container, [new File(["image"], "cover.png", { type: "image/png" })]);

    const card = await screen.findByTestId("asset-card-cover-png");
    expect(card).toHaveClass("asset-card");
    expect(card).toHaveTextContent("图片 1");

    vi.unstubAllGlobals();
  });

  it("previews image, video, and audio assets from square cards", async () => {
    vi.stubGlobal("fetch", createAssetFetchMock());

    const { container } = render(<App />);
    await activateApiKey();
    await uploadFiles(container, [
      new File(["image"], "cover.png", { type: "image/png" }),
      new File(["video"], "clip.mp4", { type: "video/mp4" }),
      new File(["audio"], "voice.mp3", { type: "audio/mpeg" })
    ]);

    fireEvent.click(await screen.findByTestId("asset-card-cover-png"));
    expect(screen.getByRole("dialog", { name: "素材预览" }).querySelector("img")).toHaveAttribute(
      "src",
      "https://cos.example/cover.png"
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭预览" }));

    fireEvent.click(screen.getByTestId("asset-card-clip-mp4"));
    const previewVideo = screen.getByRole("dialog", { name: "素材预览" }).querySelector("video");
    expect(previewVideo).toHaveAttribute("src", "https://cos.example/clip.mp4");
    expect(previewVideo).not.toHaveAttribute("autoplay");
    expect(previewVideo).toHaveAttribute("preload", "metadata");
    fireEvent.click(screen.getByRole("button", { name: "关闭预览" }));

    fireEvent.click(screen.getByTestId("asset-card-voice-mp3"));
    expect(screen.getByRole("dialog", { name: "素材预览" }).querySelector("audio")).toHaveAttribute(
      "src",
      "https://cos.example/voice.mp3"
    );

    vi.unstubAllGlobals();
  });

  it("reorders Seedance assets by dragging and submits the reordered order", async () => {
    let submittedBody: any;
    let submittedKey: string | null = null;
    vi.stubGlobal(
      "fetch",
      createAssetFetchMock((body, init) => {
        submittedBody = body;
        submittedKey = new Headers(init?.headers).get("x-openai-next-key");
      })
    );

    const { container } = render(<App />);
    await activateApiKey();
    await uploadFiles(container, [
      new File(["a"], "first.png", { type: "image/png" }),
      new File(["b"], "second.png", { type: "image/png" })
    ]);

    const firstRow = await screen.findByTestId("asset-card-first-png");
    const secondRow = await screen.findByTestId("asset-card-second-png");
    fireEvent.dragStart(secondRow);
    fireEvent.dragOver(firstRow);
    fireEvent.drop(firstRow);

    fireEvent.click(screen.getByRole("button", { name: /生成视频/ }));

    await waitFor(() => {
      expect(submittedBody?.assets.map((asset: any) => asset.id)).toEqual(["second-png", "first-png"]);
    });
    expect(submittedKey).toBe(userApiKey);

    vi.unstubAllGlobals();
  });

  it("submits GPT image requests with the activated API key", async () => {
    let submittedKey: string | null = null;
    let submittedBody: any;
    vi.stubGlobal(
      "fetch",
      createAssetFetchMock(undefined, (body, init) => {
        submittedBody = body;
        submittedKey = new Headers(init?.headers).get("x-openai-next-key");
      })
    );

    render(<App />);
    await activateApiKey();
    fireEvent.click(screen.getByRole("button", { name: "图片生成" }));
    fireEvent.click(within(screen.getByRole("group", { name: "图片比例" })).getByRole("button", { name: "9:16" }));
    fireEvent.click(within(screen.getByRole("group", { name: "图片分辨率" })).getByRole("button", { name: /4k/ }));
    fireEvent.click(screen.getByRole("button", { name: /生成图片/ }));

    await waitFor(() => {
      expect(submittedKey).toBe(userApiKey);
    });
    expect(submittedBody.size).toBe("2160x3840");
    expect(await screen.findByText("已生成并保存 1 张图片到 COS。")).toBeInTheDocument();
    expect(screen.getByText(/图片 · 1 张/)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("allows concurrent GPT image generation submissions", async () => {
    let releaseFirst: (() => void) | undefined;
    const submittedPrompts: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/tasks") return jsonResponse({ tasks: [] });
      if (url === "/api/images/generate") {
        const body = JSON.parse(String(init?.body));
        submittedPrompts.push(body.prompt);
        if (submittedPrompts.length === 1) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        return jsonResponse({
          task: {
            id: `image-task-${submittedPrompts.length}`,
            taskType: "image",
            model: "gpt-image-2",
            prompt: body.prompt,
            status: "succeeded",
            createdAt: "2026-06-25T00:00:00.000Z",
            updatedAt: "2026-06-25T00:00:00.000Z",
            outputImages: [
              {
                cosKey: `outputs/image-task-${submittedPrompts.length}.png`,
                cosUrl: `https://cos.example/outputs/image-task-${submittedPrompts.length}.png`,
                mimeType: "image/png",
                size: 1024
              }
            ]
          },
          images: [
            {
              cosKey: `outputs/image-task-${submittedPrompts.length}.png`,
              cosUrl: `https://cos.example/outputs/image-task-${submittedPrompts.length}.png`,
              mimeType: "image/png",
              size: 1024
            }
          ]
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await activateApiKey();
    fireEvent.click(screen.getByRole("button", { name: "图片生成" }));
    const submitButton = screen.getByRole("button", { name: /生成图片/ });

    fireEvent.click(submitButton);
    expect(await screen.findByText("生成中 1")).toBeInTheDocument();
    expect(submitButton).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText("图片提示词"), { target: { value: "第二个并发图片任务" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(submittedPrompts).toHaveLength(2);
    });
    releaseFirst?.();
    await screen.findByText("已生成并保存 1 张图片到 COS。");

    vi.unstubAllGlobals();
  });

  it("shows plain text API errors without JSON parse failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/tasks") return jsonResponse({ tasks: [] });
        if (url === "/api/images/generate") {
          return new Response("An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT", {
            status: 504,
            statusText: "Gateway Timeout",
            headers: { "content-type": "text/plain; charset=utf-8" }
          });
        }
        return jsonResponse({});
      })
    );

    render(<App />);
    await activateApiKey();
    fireEvent.click(screen.getByRole("button", { name: "图片生成" }));
    fireEvent.click(screen.getByRole("button", { name: /生成图片/ }));

    expect(await screen.findByText(/FUNCTION_INVOCATION_TIMEOUT/)).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected token/)).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});

async function activateApiKey() {
  fireEvent.change(screen.getByLabelText("OpenAI Next API Key"), { target: { value: userApiKey } });
  fireEvent.click(screen.getByRole("button", { name: "使用 Key" }));
  await screen.findByText("已按当前 Key 隔离任务。");
}

function createAssetFetchMock(
  onGenerate?: (body: any, init?: RequestInit) => void,
  onImageGenerate?: (body: any, init?: RequestInit) => void
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/tasks") {
      return jsonResponse({ tasks: [] });
    }
    if (url === "/api/assets/presign") {
      const body = JSON.parse(String(init?.body));
      return jsonResponse({
        asset: buildAssetRecordFromMeta(body.originalName, body.mimeType, body.size),
        upload: {
          method: "PUT",
          url: `https://cos-upload.example/${body.originalName}?sign=1`,
          headers: { "Content-Type": body.mimeType }
        }
      });
    }
    if (url.startsWith("https://cos-upload.example/")) {
      return new Response("", { status: 200 });
    }
    if (url === "/api/assets") {
      throw new Error("multipart endpoint should not be used");
    }
    if (url === "/api/generate") {
      const body = JSON.parse(String(init?.body));
      onGenerate?.(body, init);
      return jsonResponse({
        task: {
          id: "task-1",
          model: body.model,
          prompt: body.prompt,
          status: "queued",
          createdAt: "2026-06-24T00:00:00.000Z",
          updatedAt: "2026-06-24T00:00:00.000Z"
        }
      });
    }
    if (url === "/api/images/generate") {
      const body = JSON.parse(String(init?.body));
      onImageGenerate?.(body, init);
      return jsonResponse({
        task: {
          id: "image-task-1",
          taskType: "image",
          model: "gpt-image-2",
          prompt: body.prompt,
          status: "succeeded",
          createdAt: "2026-06-24T00:00:00.000Z",
          updatedAt: "2026-06-24T00:00:00.000Z",
          outputImages: [
            {
              cosKey: "outputs/image-task-1-1.png",
              cosUrl: "https://cos.example/outputs/image-task-1-1.png",
              sourceUrl: "https://example.com/generated.png",
              mimeType: "image/png",
              size: 1024
            }
          ]
        },
        images: [
          {
            cosKey: "outputs/image-task-1-1.png",
            cosUrl: "https://cos.example/outputs/image-task-1-1.png",
            sourceUrl: "https://example.com/generated.png",
            mimeType: "image/png",
            size: 1024
          }
        ]
      });
    }
    return jsonResponse({});
  });
}

function buildAssetRecord(file: File) {
  return buildAssetRecordFromMeta(file.name, file.type, file.size);
}

function buildAssetRecordFromMeta(originalName: string, mimeType: string, size: number) {
  const id = originalName.replace(/\W+/g, "-").replace(/-$/, "");
  const kind = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : "audio";
  return {
    id,
    kind,
    key: `assets/${originalName}`,
    mimeType,
    size,
    signedUrl: `https://cos.example/${originalName}`,
    createdAt: "2026-06-24T00:00:00.000Z",
    originalName
  };
}

async function uploadFiles(container: HTMLElement, files: File[]) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error("file input not found");
  fireEvent.change(input, { target: { files } });
  await waitFor(() => {
    for (const file of files) {
      expect(screen.getByText(file.name)).toBeInTheDocument();
    }
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
