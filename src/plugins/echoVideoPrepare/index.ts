import { registerPlugin } from "@capacitor/core";
import type { EchoVideoPreparePlugin } from "./definitions";

const EchoVideoPrepare = registerPlugin<EchoVideoPreparePlugin>(
  "EchoVideoPrepare",
  {
    web: () => import("./web").then((m) => new m.EchoVideoPrepareWeb()),
  },
);

export * from "./definitions";
export * from "./errors";
export { validateEchoVideoPrepareOptions } from "./validateOptions";
export { EchoVideoPrepare };
