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
app.on("ready", handleWindowReady);
app.on("window-all-closed", handleAllWindowsClosed);
app.on("activate", handleActivate);

ipcMain.handle("getConfig", handleGetConfig);
ipcMain.handle("setConfig", handleSetConfig);
