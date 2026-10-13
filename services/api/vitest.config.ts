import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    setupFiles: ["./test/setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // The tests share one isolated database schema, so files run one after another.
    fileParallelism: false,
    pool: "forks",
  },
});
