import { defineConfig } from "vitest/config";
import base from "./vitest.config";
export default defineConfig({
  ...base,
  envDir: false,
  test: { ...base.test, include: ["tests/postgres.integration.ts"], testTimeout: 15000, hookTimeout: 30000, fileParallelism: false },
});
