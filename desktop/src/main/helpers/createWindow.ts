// Module imports
import { BrowserWindow, screen, shell } from "electron";
import path from "path";

// Local imports
import { configStore } from "./configStore";
import packageData from "../../../package.json";

const EXTERNAL_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function isExternalUrl(url: string) {
  try {
    const { protocol } = new URL(url);
    return EXTERNAL_URL_PROTOCOLS.has(protocol);
  } catch {
    return false;
  }
}

/**
 * Creates a new window.
 */
export async function createWindow() {
  // Get the resolution of the current screen.
  const display = screen.getPrimaryDisplay();

  const backgroundColor = await configStore.get("settings::color::mainBackground");

  const mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: backgroundColor ?? "#000000",
    height: display.workArea.height,
    show: false,
    title: packageData.productName,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: true,
      preload: path.join(__dirname, "preload.js"),
      sandbox: true,
      webgl: true,
    },
    width: display.workArea.width,
    x: display.workArea.x,
    y: display.workArea.y,
    // testing
    titleBarStyle: "hidden",
    titleBarOverlay: true,
    frame: false,
    resizable: true,
  });

  // Route external links (e.g. http/https) to the user's default browser
  // instead of trying to navigate inside the Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url === mainWindow.webContents.getURL()) {
      return;
    }
    if (isExternalUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "..", "renderer", MAIN_WINDOW_VITE_NAME, "index.html"),
    );
  }

  mainWindow.once("ready-to-show", () => mainWindow.show());
}
