import { describe, expect, it } from "vitest";
import { createGame } from "./engine";
import { buildSitzungsprotokoll, formatDuration } from "./summary";

describe("Sitzungsprotokoll", () => {
  it("fasst Dauer, Sitze und Beschlüsse zusammen", () => {
    const state = createGame(
      [
        { id: "a", name: "Ada" },
        { id: "b", name: "Bea" },
        { id: "c", name: "Cem" },
        { id: "d", name: "Doro" },
        { id: "e", name: "Eli" },
      ],
      { seed: 3 },
    );
    state.phase = "game_over";
    state.winner = "verein";
    state.winReason = "vereinswohl_track";
    state.players[1]!.alive = false;
    state.enactedVereinswohl.push({
      id: "vw-x",
      type: "vereinswohl",
      title: "Offene Kasse",
      flavor: "Jede Quittung hängt aus.",
      chaos: false,
      power: null,
    });
    const sheet = buildSitzungsprotokoll(state, {
      id: "blatt12345",
      code: "K7MP",
      startedAt: 1_000,
      endedAt: 91_000,
    });
    expect(sheet?.durationMs).toBe(90_000);
    expect(sheet?.players.find((player) => player.name === "Bea")?.alive).toBe(false);
    expect(sheet?.vereinswohl[0]?.title).toBe("Offene Kasse");
    expect(formatDuration(90_000)).toBe("1 Min. 30 Sek.");
    expect(formatDuration(3_720_000)).toBe("1 Std. 2 Min.");
  });

  it("gibt vor dem Ende nichts heraus", () => {
    const state = createGame(
      [
        { id: "a", name: "Ada" },
        { id: "b", name: "Bea" },
        { id: "c", name: "Cem" },
        { id: "d", name: "Doro" },
        { id: "e", name: "Eli" },
      ],
      { seed: 1 },
    );
    expect(buildSitzungsprotokoll(state, { id: "x", code: "K7MP", startedAt: 0, endedAt: 1 })).toBeNull();
  });
});