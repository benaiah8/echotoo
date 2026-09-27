import { Capacitor, registerPlugin } from "@capacitor/core";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import type { EchoVideoUploadPlugin } from "./definitions";

const EchoVideoUpload = registerPlugin<EchoVideoUploadPlugin>(
  "EchoVideoUpload",
  {
    web: () => import("./web").then((m) => new m.EchoVideoUploadWeb()),
  },
);

export * from "./definitions";
export * from "./errors";
export {
  validateEchoVideoUploadOptions,
  encodeTusUploadMetadata,
} from "./validateOptions";
export { EchoVideoUpload };

/** Sync gate: Capacitor Android/iOS may use EchoVideoUpload (PASS IOS2). */
export function isNativeEchoVideoUploadAvailable(): boolean {
  try {
    if (!isNativeApp()) return false;
    const platform = Capacitor.getPlatform();
    return platform === "android" || platform === "ios";
  } catch {
    return false;
  }
}
