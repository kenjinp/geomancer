// Module imports
import { DiskStore } from "./DiskStore";

// Local imports
import defaults from "../../defaultConfig";

// Variables
export const configStore = new DiskStore({ defaults });
