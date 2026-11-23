import { describe, expect, it } from "vitest";
import { createGame } from "./engine";
import { chooseNpcAction, npcSeatNames } from "./npc";
import type { EnactedPolicy, GameState, Role } from "./types";

const five: Role[] = ["linientreuer", "nils", "ehrliches_mitglied", "ehrliches_mitglied", "ehrliches_mitglied"];

function seated(president = 0): GameState {
  const state = createGame(
    five.map((_, index) => ({ id: `p${index}`, name: `P${index}` })),
    { seed: 2, roleOrder: five, firstPresidentIndex: president, drawPile: [] },
  );
  for (const player of state.players) state.briefingAck[player.id] = true;
  state.phase = "nominating";
  return state;
}

function fascistPolicies(count: number): EnactedPolicy[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `ei-${index}`,
    type: "eigeninteresse",
    title: `Beschluss ${index}`,
    flavor: "",
    chaos: false,
    power: null,
  }));
}

describe("Platzhalter", () => {
  it("vergibt freie Namen bis der Tisch fünf Sitze hat", () => {
    expect(npcSeatNames(["Inge Platzhalter"], 2)).toEqual(["Uwe Platzhalter", "Heike Platzhalter"]);
    expect(npcSeatNames([], 0)).toEqual([]);
  });

  it("schlägt Nils vor, wenn der Klüngel schon drei Eigeninteresse-Beschlüsse hat", () => {
    const state = seated(0);
    state.enactedEigeninteresse = fascistPolicies(3);
    expect(chooseNpcAction(state, new Set(["p0"]))).toEqual({
      type: "nominate",
      playerId: "p0",
      chancellorId: "p1",
    });
    expect(chooseNpcAction(state, new Set(["p2"]))).toBeNull();
  });

  it("stimmt als Klüngel gegen ein ehrliches Mitglied und als ehrliches Mitglied zu", () => {
    const state = seated(0);
    state.phase = "voting";
    state.nominatedChancellorIndex = 2;
    expect(chooseNpcAction(state, new Set(["p0"]))).toEqual({
      type: "vote",
      playerId: "p0",
      ballot: "ablehnen",
    });
    expect(chooseNpcAction(state, new Set(["p3"]))).toEqual({
      type: "vote",
      playerId: "p3",
      ballot: "zustimmen",
    });
  });

  it("wirft die unpassende Vorlage weg und schließt Nils nicht aus", () => {
    const state = seated(2);
    state.phase = "legislative_president";
    state.presidentHand = [
      { id: "gut", type: "vereinswohl", title: "Gut", flavor: "" },
      { id: "schlecht", type: "eigeninteresse", title: "Schlecht", flavor: "" },
      { id: "auch-gut", type: "vereinswohl", title: "Auch gut", flavor: "" },
    ];
    expect(chooseNpcAction(state, new Set(["p2"]))).toEqual({
      type: "discard",
      playerId: "p2",
      policyId: "schlecht",
    });

    const fascists = seated(0);
    fascists.phase = "executive";
    fascists.pendingPower = "nicht_entlastung";
    const exclusion = chooseNpcAction(fascists, new Set(["p0"]));
    expect(exclusion?.type).toBe("exclude");
    if (exclusion?.type === "exclude") expect(exclusion.targetId).not.toBe("p1");
  });
});
