import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ["react", "react-dom"],
  // The "use client" directive is re-added post-build (see scripts/add-use-client.mjs);
  // esbuild strips module-level directives during bundling.
});
