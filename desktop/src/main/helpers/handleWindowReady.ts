// Module imports
import { session } from "electron";

import devtoolsInstaller, {
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";

// Local imports
import { createWindow } from "./createWindow";
import { handleHeadersReceived } from "./handleHeadersReceived";

/**
 * Executes when the window is ready.
 */
export async function handleWindowReady() {
  session.defaultSession.webRequest.onHeadersReceived(handleHeadersReceived);

  await createWindow();

  // React Dev Tools
  devtoolsInstaller(REACT_DEVELOPER_TOOLS)
    .then((name) => console.log("Added Extension:", name))
    .catch((error) => console.log("An error occurred: ", error));
}
