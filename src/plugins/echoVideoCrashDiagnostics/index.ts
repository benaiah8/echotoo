import { registerPlugin } from "@capacitor/core";
import type { EchoVideoCrashDiagnosticsPlugin } from "./definitions";

const EchoVideoCrashDiagnostics =
  registerPlugin<EchoVideoCrashDiagnosticsPlugin>("EchoVideoCrashDiagnostics", {
    web: () =>
      import("./web").then((m) => new m.EchoVideoCrashDiagnosticsWeb()),
  });

export * from "./definitions";
export { EchoVideoCrashDiagnostics };
