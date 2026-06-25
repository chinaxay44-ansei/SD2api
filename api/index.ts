import path from "node:path";
import { createApp } from "../server/src/app.js";
import { config } from "../server/src/config.js";
import { archiveGeneratedImage, archiveOutputVideo, uploadAssetFile } from "../server/src/cos.js";
import { generateGptImage } from "../server/src/imageClient.js";
import { createSeedanceTask, getSeedanceTask } from "../server/src/seedanceClient.js";
import { createTaskStore } from "../server/src/taskStoreFactory.js";

const app = createApp({
  uploadAsset: uploadAssetFile,
  createTask: createSeedanceTask,
  getRemoteTask: getSeedanceTask,
  archiveOutput: archiveOutputVideo,
  archiveImage: archiveGeneratedImage,
  generateImage: generateGptImage,
  taskStore: createTaskStore({
    dataFile: path.resolve("/tmp", "seedance-tasks.json"),
    supabase: config.supabase
  })
});

export default app;
