// Local imports
import { configStore } from "./configStore";

/**
 * Updates user settings on disk.
 *
 * @param {*} _
 * @param {string} key The config key to be updated.
 * @param {string} value The new value.
 */
export function handleSetConfig(_, key: string, value: any) {
  configStore.set(key, value);
}
