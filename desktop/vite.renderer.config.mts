import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";
// import topLevelAwait from "vite-plugin-top-level-await";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config
export default defineConfig({
  // You might not need those. They are needed when importing modules with
  // top-level await such as three/examples/jsm/capabilities/WebGPU

  optimizeDeps: {
    esbuildOptions: { target: "esnext" },
    exclude: ["@jsquash/webp"],
  },
  build: { target: "esnext" },
  plugins: [
    react(),
    tsconfigPaths(),
    glsl(),
    // topLevelAwait({
    //   promiseExportName: "__tla",
    //   promiseImportName: (i: any) => `__tla_${i}`,
    // }),
  ],
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'",
    },
  },
});
