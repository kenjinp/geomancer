// Local imports
import { configStore } from "./configStore";

/**
 * Retrieves user settings from disk.
 *
 * @param {*} _
 * @param {string} key The key of the config to be retrieved.
 * @returns {*} The value at the requested key in the config store.
 */
export function handleGetConfig(_, key: string) {
  return configStore.get(key);
}
