import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  outDir: 'lib',
  dts: false,
  clean: true,
  splitting: false,
  sourcemap: false,
  external: ['koishi', 'koishi-plugin-chatluna'],
  noExternal: ['shared-chatluna-xmltools'],
  skipNodeModulesBundle: true,
})
