export const cspConfig = {
  // 'wasm-unsafe-eval' is required so libraries like @jsquash/webp can compile
  // their WebAssembly modules at runtime (governed by script-src / default-src).
  "default-src": [
    "'wasm-unsafe-eval'",
    { development: ["'self'", "'unsafe-eval'"] },
    { production: "file:" },
  ],

  "connect-src": ["data:", { development: ["'self'"] }, { production: "file:" }],
  "font-src": ["file:", { development: ["'self'"] }],
  "img-src": ["'self'", "file:", "data:"],
  "script-src": [
    "'wasm-unsafe-eval'",
    "file:",
    { development: ["'self'", "'unsafe-eval'", "'unsafe-inline'"] },
  ],
  "script-src-elem": [
    "file:",
    { development: ["'self'", "'unsafe-eval'"] },
    { development: ["'unsafe-inline'"] },
  ],
  "style-src": ["'unsafe-inline'", "file:", { development: ["'self'"] }],
  "style-src-elem": ["'unsafe-inline'", { production: "file:" }],
  "worker-src": ["blob:"],
};
