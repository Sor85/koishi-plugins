import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  outDir: "lib",
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  external: [
    "koishi",
    "koishi-plugin-chatluna",
    "koishi-plugin-chatluna/services/chat",
    "koishi-plugin-chatluna/utils/string",
    "koishi-plugin-chatluna/utils/schema",
    "@koishijs/plugin-console",
  ],
  noExternal: ["chatluna-xml-tools"],
  skipNodeModulesBundle: true,
});
