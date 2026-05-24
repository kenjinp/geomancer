export const cspConfig = {
  "default-src": [{ development: ["'self'", "'unsafe-eval'"] }, { production: "file:" }],

  "connect-src": ["data:", { development: ["'self'"] }, { production: "file:" }],
  "font-src": ["file:", { development: ["'self'"] }],
  "img-src": ["'self'", "file:", "data:"],
  "script-src-elem": [
    "file:",
    { development: ["'self'", "'unsafe-eval'"] },
    { development: ["'unsafe-inline'"] },
  ],
  "style-src": ["'unsafe-inline'", "file:", { development: ["'self'"] }],
  "style-src-elem": ["'unsafe-inline'", { production: "file:" }],
  "worker-src": ["blob:"],
};
