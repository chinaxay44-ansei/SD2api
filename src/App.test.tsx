import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

const userApiKey = "user-key-a";

describe("App", () => {
  it("renders the two-column Seedance generation workspace without exposing secrets", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ tasks: [] }))));

    const { container } = render(<App />);

    expect(await screen.findByText("Seedance 2 视频生成")).toBeInTheDocument();
    expect(screen.getByLabelText("OpenAI Next API Key")).toBeInTheDocument();
    expect(screen.getByLabelText("提示词")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生成视频/ })).toBeInTheDocument();
    expect(screen.getByText("任务状态")).toBeInTheDocument();
    expect(screen.getByText("最近任务")).toBeInTheDocument();
    expect(container.textContent).not.toContain("sk-");
    expect(container.textContent).not.toContain("SecretKey");
    expect(container.textContent).not.toContain("AKID");

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
            cosVideoUrl: "https://cos.example/resume.mp4",
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
    expect(container.querySelector(".video-stage video")).toHaveAttribute("src", "https://cos.example/resume.mp4");

    vi.unstubAllGlobals();
  });

  it("updates mode-specific guidance when first-last frame mode is selected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ tasks: [] }))));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "首尾帧" }));

    expect(await screen.findByText("需要 2 个图片素材，上传顺序即首帧、尾帧。")).toBeInTheDocument();

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
    expect(
      Array.from(container.querySelectorAll('[aria-label="图片生成工作台"] .panel-heading h2')).map((heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["图片设置", "参考图片", "生成结果", "最近图片任务"]);
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

  it("labels uploaded Seedance assets with kind-specific order numbers", async () => {
    vi.stubGlobal("fetch", createAssetFetchMock());

    const { container } = render(<App />);
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

    await uploadFiles(container, [new File(["image"], "cover.png", { type: "image/png" })]);

    const card = await screen.findByTestId("asset-card-cover-png");
    expect(card).toHaveClass("asset-card");
    expect(card).toHaveTextContent("图片 1");

    vi.unstubAllGlobals();
  });

  it("previews image, video, and audio assets from square cards", async () => {
    vi.stubGlobal("fetch", createAssetFetchMock());

    const { container } = render(<App />);
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
    expect(screen.getByRole("dialog", { name: "素材预览" }).querySelector("video")).toHaveAttribute(
      "src",
      "https://cos.example/clip.mp4"
    );
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
    if (url === "/api/assets") {
      const file = (init?.body as FormData).get("file") as File;
      const id = file.name.replace(/\W+/g, "-").replace(/-$/, "");
      const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "audio";
      return jsonResponse({
        asset: {
          id,
          kind,
          key: `assets/${file.name}`,
          mimeType: file.type,
          size: file.size,
          signedUrl: `https://cos.example/${file.name}`,
          createdAt: "2026-06-24T00:00:00.000Z",
          originalName: file.name
        }
      });
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
