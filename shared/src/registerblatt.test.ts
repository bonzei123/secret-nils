import { describe, expect, it } from "vitest";
import { parseProtokollDatei, protokollDatei, renderProtokollSvg } from "./registerblatt";
import type { Sitzungsprotokoll } from "./summary";

const sheet: Sitzungsprotokoll = {
  id: "blatt12345",
  code: "K7MP",
  startedAt: Date.parse("2026-11-23T15:00:00Z"),
  endedAt: Date.parse("2026-11-23T15:01:30Z"),
  durationMs: 90_000,
  winner: "verein",
  winTitle: "Der Club bleibt in Mitgliederhand",
  winBody: "Fünf saubere Beschlüsse.",
  winStamp: "Verein gewinnt",
  players: [
    { name: "Ada <Gast>", role: "nils", roleTitle: "Nils", alive: false, npc: false },
    { name: "Bea", role: "ehrliches_mitglied", roleTitle: "Ehrliches Mitglied", alive: true, npc: false },
  ],
  vereinswohl: [{ title: "Offene Kasse", flavor: "Jede Quittung hängt aus.", chaos: false }],
  eigeninteresse: [],
};

describe("Registerdatei", () => {
  it("legt die Sitzung in den Dateinamen und liest sie wieder heraus", () => {
    const datei = protokollDatei(sheet);
    const parsed = parseProtokollDatei(datei);
    expect(parsed?.code).toBe("K7MP");
    expect(parsed?.winner).toBe("verein");
    expect(parsed?.dauer).toBe("1 Min. 30 Sek.");
    expect(parsed?.id).toBe("blatt12345");
    expect(parsed?.zeit).toContain("23.11.2026");
  });

  it("zeichnet die Sitzung und maskiert Zeichen", () => {
    const svg = renderProtokollSvg(sheet);
    expect(svg).toContain("Ada &lt;Gast&gt;");
    expect(svg).toContain("Offene Kasse");
    expect(svg).toContain("#12281d");
    expect(svg).not.toContain("Ada <Gast>");
  });

  it("ignoriert fremde Dateien", () => {
    expect(parseProtokollDatei("notizen.txt")).toBeNull();
    expect(parseProtokollDatei("../geheim.svg")).toBeNull();
  });
});