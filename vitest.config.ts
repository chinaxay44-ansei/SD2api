import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.tsx", "server/src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"]
  }
});
