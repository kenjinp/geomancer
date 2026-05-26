// Module imports
import { app, ipcMain } from "electron";

// Local imports
import started from "electron-squirrel-startup";

import { handleActivate } from "./helpers/handleActivate";
import { handleAllWindowsClosed } from "./helpers/handleAllWindowsClosed";
import { handleGetConfig } from "./helpers/handleGetConfig";
import { handleSetConfig } from "./helpers/handleSetConfig";
import { handleWindowReady } from "./helpers/handleWindowReady";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// On Linux, Chromium ships WebGPU disabled by default. Dawn's Linux backend is
// Vulkan, so we turn the Vulkan feature on and bypass the GPU driver allowlist
// so non-allowlisted Mesa/NVIDIA combos can still allocate an adapter.
// No-op on Windows/macOS where WebGPU is already enabled.
if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-features", "Vulkan");
  app.commandLine.appendSwitch("enable-unsafe-webgpu");
}

app.on("ready", handleWindowReady);
app.on("window-all-closed", handleAllWindowsClosed);
app.on("activate", handleActivate);

ipcMain.handle("getConfig", handleGetConfig);
ipcMain.handle("setConfig", handleSetConfig);
