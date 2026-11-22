import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@secret-nils/shared": path.resolve(__dirname, "shared/src/index.ts"),
    },
  },
  test: {
    include: ["shared/src/**/*.test.ts", "server/src/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
