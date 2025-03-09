import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";
// import topLevelAwait from "vite-plugin-top-level-await";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config
export default defineConfig({
  optimizeDeps: {
    esbuildOptions: { target: "esnext" },
    exclude: ["@jsquash/webp"],
  },
  build: { target: "esnext" },
  plugins: [react(), tsconfigPaths(), glsl()],
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
