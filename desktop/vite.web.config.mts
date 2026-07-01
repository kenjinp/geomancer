import react from "@vitejs/plugin-react-oxc";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";
import tsconfigPaths from "vite-tsconfig-paths";

import { getLastCommit } from "./commit-info";

const commitInfo = getLastCommit({});
const helloTerrainReact = fileURLToPath(
  new URL("./node_modules/@hello-terrain/react/dist/index.mjs", import.meta.url),
);
const helloTerrainThree = fileURLToPath(
  new URL("./node_modules/@hello-terrain/three/dist/index.mjs", import.meta.url),
);
const helloTerrainWork = fileURLToPath(
  new URL("./node_modules/@hello-terrain/work/dist/index.mjs", import.meta.url),
);

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      "@hello-terrain/react": helloTerrainReact,
      "@hello-terrain/three": helloTerrainThree,
      "@hello-terrain/work": helloTerrainWork,
    },
    dedupe: ["@react-three/fiber", "react", "react-dom", "three"],
    preserveSymlinks: true,
  },
  optimizeDeps: {
    esbuildOptions: { target: "esnext" },
    exclude: [
      "@hello-terrain/react",
      "@hello-terrain/three",
      "@hello-terrain/work",
      "@jsquash/webp",
    ],
    include: ["three/webgpu", "three/tsl"],
  },
  build: { target: "esnext", outDir: "../_dist" },
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
  define: {
    __COMMIT_INFO__: JSON.stringify(commitInfo),
    __BUILD_INFO__: JSON.stringify({
      buildTime: Date.now(),
    }),
  },
});
