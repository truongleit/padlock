import { fileURLToPath } from "node:url";

import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // swc emits decorator metadata, which Nest DI needs and esbuild does not.
  plugins: [swc.vite({ jsc: { target: "es2023" } })],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    setupFiles: ["src/test/setup.ts"],
  },
});
