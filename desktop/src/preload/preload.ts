// Module imports
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("IPCBridge", {
  /**
   * Host OS platform, mirrors Node's `process.platform`
   * ("linux" | "darwin" | "win32" | ...).
   */
  platform: process.platform,

  /**
   * Gets a config value from disk.
   *
   * @param {string} key The config key to be retrieved.
   * @returns {Promise<*>} The value of the config.
   */
  getConfig: (key: string) => ipcRenderer.invoke("getConfig", key),

  /**
   * Persists a config value to disk.
   *
   * @param {string} key The config key to be set.
   * @param {*} value The new config value.
   */
  setConfig: (key: string, value: unknown) => {
    ipcRenderer.invoke("setConfig", key, value);
  },
});
