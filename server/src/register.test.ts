import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Sitzungsprotokoll } from "@secret-nils/shared";
import { RegisterArchive } from "./register.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const sheet: Sitzungsprotokoll = {
  id: "blatt12345",
  code: "K7MP",
  startedAt: 0,
  endedAt: 90_000,
  durationMs: 90_000,
  winner: "kluengel",
  winTitle: "Die Kasse gehört dem Klüngel",
  winBody: "Sechs Beschlüsse.",
  winStamp: "Klüngel gewinnt",
  players: [{ name: "Ada", role: "nils", roleTitle: "Nils", alive: true, npc: false }],
  vereinswohl: [],
  eigeninteresse: [{ title: "Dienstwagen", flavor: "Nur für Vereinsfahrten.", chaos: false }],
};

describe("Registerordner", () => {
  it("listet nur Dateien, die noch im Ordner liegen", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "register-"));
    dirs.push(dir);
    const archive = new RegisterArchive(dir);
    const datei = archive.save(sheet);
    expect(archive.list().map((entry) => entry.datei)).toEqual([datei]);
    expect(archive.resolve(datei)).toBe(path.join(dir, datei));
    expect(archive.resolve("../policies.json")).toBeNull();
    unlinkSync(path.join(dir, datei));
    expect(archive.list()).toEqual([]);
  });
});