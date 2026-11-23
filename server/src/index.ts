import path from "node:path";
import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";
import { PolicyStore } from "./policy-store.js";
import { SummaryStore } from "./summary-store.js";

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "0.0.0.0";
const policiesPath = process.env.POLICIES_PATH ?? path.resolve(process.cwd(), "../data/policies.json");
const policyPassword = process.env.SATZUNG_PASSWORT?.trim() || undefined;
const publicOrigin = process.env.PUBLIC_ORIGIN?.trim().replace(/\/$/, "") || undefined;

export function start() {
  const app = createApp({
    policies: new PolicyStore(policiesPath),
    policyPassword,
    summaries: new SummaryStore(path.join(path.dirname(policiesPath), "protokolle.json")),
    publicOrigin,
  });
  app.httpServer.listen(port, host, () => {
    console.log(`Secret Nils hört auf http://${host}:${port}`);
  });
  return app;
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) start();
