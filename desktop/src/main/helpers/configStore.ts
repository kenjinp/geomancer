import { DiskStore } from "./DiskStore";
import defaults from "../../defaultConfig";

export const configStore = new DiskStore({ defaults });
