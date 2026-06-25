import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { archiveOutputVideo, uploadAssetFile } from "./cos.js";
import { generateGptImage } from "./imageClient.js";
import { createSeedanceTask, getSeedanceTask } from "./seedanceClient.js";
import { createTaskStore } from "./taskStoreFactory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataFile = path.resolve(process.cwd(), "data", "tasks.json");
const clientDist = path.resolve(process.cwd(), "dist", "client");

const app = createApp({
  uploadAsset: uploadAssetFile,
  createTask: createSeedanceTask,
  getRemoteTask: getSeedanceTask,
  archiveOutput: archiveOutputVideo,
  generateImage: generateGptImage,
  taskStore: createTaskStore({
    dataFile,
    supabase: config.supabase
  })
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(clientDist));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(config.server.port, "127.0.0.1", () => {
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  console.log(`Seedance 2 tool server listening on http://127.0.0.1:${config.server.port} (${mode})`);
  void __dirname;
});
