/**
 * 构建配置
 * 输出共享 XML 基础工具
 */

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  outDir: "lib",
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  skipNodeModulesBundle: true,
});
