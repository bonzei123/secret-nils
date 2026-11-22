import path from "node:path";
import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "0.0.0.0";

export function start() {
  const app = createApp();
  app.httpServer.listen(port, host, () => {
    console.log(`Secret Nils hört auf http://${host}:${port}`);
  });
  return app;
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) start();
