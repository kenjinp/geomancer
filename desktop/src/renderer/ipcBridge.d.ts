/**
 * Types for the `IPCBridge` object exposed from the preload script
 * via `contextBridge.exposeInMainWorld`. Keep in sync with
 * `desktop/src/preload/preload.ts`.
 */

export interface IPCBridge {
  platform: NodeJS.Platform;
  getConfig: (key: string) => Promise<unknown>;
  setConfig: (key: string, value: unknown) => void;
}

declare global {
  interface Window {
    IPCBridge: IPCBridge;
  }
}

export {};
