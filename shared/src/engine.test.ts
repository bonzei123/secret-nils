import { describe, expect, it } from "vitest";
import { CATALOG } from "./deck";
import {
  applyAction,
  applyTimeout,
  canBeChancellor,
  createGame,
  eligibleChancellorIds,
  listLegalActions,
  projectView,
} from "./index";
import { boardPowers, nilsKnowsStaff, roleCounts } from "./roles";
import { normalizeRoomCode, sanitizeName } from "./names";
import type { EngineAction, GameState, PolicyCard, Role } from "./types";

function people(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `M${index + 1}`,
  }));
}

function card(id: string, type: PolicyCard["type"], title = id): PolicyCard {
  return { id, type, title, flavor: `flavor-${id}` };
}

function fascistDeck(count = 24): PolicyCard[] {
  return Array.from({ length: count }, (_, index) => card(`f-${index}`, "eigeninteresse", `Eigen ${index}`));
}

function vereinDeck(count = 24): PolicyCard[] {
  return Array.from({ length: count }, (_, index) => card(`v-${index}`, "vereinswohl", `Wohl ${index}`));
}

function must(state: GameState, action: EngineAction): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function begin(state: GameState): GameState {
  for (const player of state.players) {
    if (!state.briefingAck[player.id]) state = must(state, { type: "ack_briefing", playerId: player.id });
  }
  expect(state.phase).toBe("nominating");
  return state;
}

function fresh(options: {
  count?: number;
  roles?: Role[];
  draw?: PolicyCard[];
  discard?: PolicyCard[];
  president?: number;
  seed?: number;
}): GameState {
  const count = options.count ?? options.roles?.length ?? 5;
  return begin(
    createGame(people(count), {
      seed: options.seed ?? 7,
      roleOrder: options.roles,
      drawPile: options.draw,
      discardPile: options.discard,
      firstPresidentIndex: options.president ?? 0,
    }),
  );
}

function enactTop(state: GameState): GameState {
  expect(state.phase).toBe("nominating");
  const president = state.players[state.presidentIndex];
  if (!president) throw new Error("Kein Vorsitz");
  const chancellorId = eligibleChancellorIds(state)[0];
  if (!chancellorId) throw new Error("Kein wählbarer Kassenwart");
  state = must(state, { type: "nominate", playerId: president.id, chancellorId });
  for (const player of state.players) {
    if (!player.alive || state.votes[player.id]) continue;
    state = must(state, { type: "vote", playerId: player.id, ballot: "zustimmen" });
  }
  expect(state.phase).toBe("legislative_president");
  const discardId = state.presidentHand.at(-1)?.id;
  if (!discardId) throw new Error("Keine Hand");
  state = must(state, { type: "discard", playerId: president.id, policyId: discardId });
  const chancellor = state.chancellorIndex === null ? undefined : state.players[state.chancellorIndex];
  const enactId = state.chancellorHand[0]?.id;
  if (!chancellor || !enactId) throw new Error("Keine Beschlussvorlage");
  return must(state, { type: "enact", playerId: chancellor.id, policyId: enactId });
}

function settle(state: GameState): GameState {
  let guard = 0;
  while (state.phase === "executive" && guard < 8) {
    guard += 1;
    const president = state.players[state.presidentIndex];
    if (!president) throw new Error("Kein Vorsitz");
    if (state.pendingPower === "tagesordnung") {
      state = must(state, { type: "ack_peek", playerId: president.id });
    } else if (state.pendingPower === "kassenpruefung" || state.pendingPower === "sondersitzung") {
      const target = state.players.find((player) => player.alive && player.id !== president.id);
      if (!target) throw new Error("Kein Ziel");
      state = must(state, {
        type: state.pendingPower === "kassenpruefung" ? "investigate" : "special_election",
        playerId: president.id,
        targetId: target.id,
      });
    } else if (state.pendingPower === "nicht_entlastung") {
      const target = state.players.find(
        (player) => player.alive && player.id !== president.id && player.role === "ehrliches_mitglied",
      );
      if (!target) throw new Error("Kein ehrliches Ziel");
      state = must(state, { type: "exclude", playerId: president.id, targetId: target.id });
    } else {
      throw new Error(`Unbehandelte Sonderaktion ${state.pendingPower}`);
    }
  }
  return state;
}

function pushFascist(state: GameState): GameState {
  const next = settle(enactTop(state));
  return next;
}

const standardFive: Role[] = [
  "ehrliches_mitglied",
  "ehrliches_mitglied",
  "ehrliches_mitglied",
  "linientreuer",
  "nils",
];

describe("Rollen und Wissen", () => {
  it("verteilt 5 bis 10 Mitglieder nach Satzung", () => {
    for (let count = 5; count <= 10; count += 1) {
      const expected = roleCounts(count);
      for (let seed = 1; seed <= 12; seed += 1) {
        const state = createGame(people(count), { seed });
        const roles = state.players.map((player) => player.role);
        expect(roles.filter((role) => role === "ehrliches_mitglied")).toHaveLength(expected.ehrlich);
        expect(roles.filter((role) => role === "linientreuer")).toHaveLength(expected.linientreu);
        expect(roles.filter((role) => role === "nils")).toHaveLength(1);
        expect(new Set(state.players.map((player) => player.seat)).size).toBe(count);
      }
    }
  });

  it("zeigt Nils ab 7 die Festangestellten nicht, umgekehrt schon", () => {
    for (let count = 5; count <= 10; count += 1) {
      const state = createGame(people(count), { seed: 3, firstPresidentIndex: 0 });
      const nils = state.players.find((player) => player.role === "nils");
      const staff = state.players.filter((player) => player.role === "linientreuer");
      const liberals = state.players.filter((player) => player.role === "ehrliches_mitglied");
      if (!nils) throw new Error("Nils fehlt");

      const nilsView = projectView(state, nils.id);
      const staffIds = new Set(staff.map((player) => player.id));
      if (nilsKnowsStaff(count)) {
        expect(nilsView.allies.map((ally) => ally.id).sort()).toEqual([...staffIds].sort());
      } else {
        expect(nilsView.allies).toEqual([]);
        expect(JSON.stringify(nilsView)).not.toContain('"role":"linientreuer"');
      }

      for (const member of staff) {
        const view = projectView(state, member.id);
        expect(view.allies.map((ally) => ally.id)).toContain(nils.id);
        for (const other of staff) {
          if (other.id !== member.id) expect(view.allies.map((ally) => ally.id)).toContain(other.id);
        }
        expect(view.allies.some((ally) => ally.role === "nils" && ally.id === nils.id)).toBe(true);
      }

      for (const member of liberals) {
        const view = projectView(state, member.id);
        expect(view.allies).toEqual([]);
        expect(view.revealed).toBeNull();
        expect(JSON.stringify(view)).not.toContain('"role":"nils"');
        expect(JSON.stringify(view)).not.toContain('"role":"linientreuer"');
      }
    }
  });

  it("gibt vor dem ersten Beschluss keine Kartentexte an Clients", () => {
    const state = createGame(people(6), { seed: 4, firstPresidentIndex: 1 });
    for (const player of state.players) {
      const json = JSON.stringify(projectView(state, player.id));
      expect(json).not.toContain('"drawPile"');
      expect(json).not.toContain('"presidentHand"');
      expect(json).not.toContain('"rng"');
      for (const policy of CATALOG) {
        expect(json).not.toContain(policy.title);
        expect(json).not.toContain(policy.flavor);
      }
    }
  });

  it("lehnt ungültige Tischgrößen und Rollenlisten ab", () => {
    expect(() => createGame(people(4))).toThrow(/5 bis 10/);
    expect(() => createGame(people(11))).toThrow(/5 bis 10/);
    expect(() =>
      createGame(people(5), {
        roleOrder: ["nils", "nils", "nils", "nils", "nils"],
      }),
    ).toThrow(/Rollenverteilung/);
  });
});

describe("Wahl, Tracker, Amtsperre", () => {
  it("bestätigt nur bei Mehrheit und zeigt Stimmkarten erst danach", () => {
    let state = fresh({ roles: standardFive, draw: fascistDeck() });
    const president = state.players[0]!;
    state = must(state, { type: "nominate", playerId: president.id, chancellorId: "p1" });
    state = must(state, { type: "vote", playerId: "p0", ballot: "ablehnen" });
    const outsider = projectView(state, "p2");
    expect(outsider.players.every((player) => player.ballot === null)).toBe(true);
    expect(outsider.players.find((player) => player.id === "p0")?.voted).toBe(true);
    expect(JSON.stringify(outsider)).not.toContain('"ballot":"ablehnen"');

    state = must(state, { type: "vote", playerId: "p1", ballot: "zustimmen" });
    state = must(state, { type: "vote", playerId: "p2", ballot: "zustimmen" });
    state = must(state, { type: "vote", playerId: "p3", ballot: "zustimmen" });
    expect(state.phase).toBe("voting");
    state = must(state, { type: "vote", playerId: "p4", ballot: "ablehnen" });
    expect(state.phase).toBe("legislative_president");
    expect(state.lastElection).toEqual({ ja: 3, nein: 2, passed: true });
    const revealed = projectView(state, "p2");
    expect(revealed.players.find((player) => player.id === "p0")?.ballot).toBe("ablehnen");
    expect(revealed.players.find((player) => player.id === "p1")?.ballot).toBe("zustimmen");
    expect(state.chancellorIndex).toBe(1);
  });

  it("wertet Gleichstand als Ablehnung", () => {
    const roles: Role[] = [
      "ehrliches_mitglied",
      "ehrliches_mitglied",
      "ehrliches_mitglied",
      "ehrliches_mitglied",
      "linientreuer",
      "nils",
    ];
    let state = fresh({ roles, draw: fascistDeck(), count: 6 });
    state = must(state, { type: "nominate", playerId: "p0", chancellorId: "p1" });
    for (const id of ["p0", "p1", "p2"]) state = must(state, { type: "vote", playerId: id, ballot: "zustimmen" });
    for (const id of ["p3", "p4", "p5"]) state = must(state, { type: "vote", playerId: id, ballot: "ablehnen" });
    expect(state.lastElection).toEqual({ ja: 3, nein: 3, passed: false });
    expect(state.electionTracker).toBe(1);
    expect(state.phase).toBe("nominating");
    expect(state.chancellorIndex).toBeNull();
    expect(state.presidentIndex).toBe(1);
  });

  it("sperrt den letzten Kassenwart und ab fünf Personen auch den letzten Vorsitz", () => {
    let state = fresh({ roles: standardFive, draw: vereinDeck() });
    state = enactTop(state);
    expect(state.phase).toBe("nominating");
    expect(state.players[state.presidentIndex]?.id).toBe("p1");
    expect(canBeChancellor(state, 0)).toBe(false);
    expect(canBeChancellor(state, 1)).toBe(false);
    const blocked = applyAction(state, { type: "nominate", playerId: "p1", chancellorId: "p0" });
    expect(blocked.ok).toBe(false);
    expect(applyAction(state, { type: "nominate", playerId: "p2", chancellorId: "p3" }).ok).toBe(false);
  });

  it("hebt die Amtsperre nach der Notverwaltung auf", () => {
    let state = fresh({ roles: standardFive, draw: vereinDeck() });
    state = enactTop(state);
    const oldPresident = state.previousPresidentIndex;
    const oldChancellor = state.previousChancellorIndex;
    for (let round = 0; round < 3; round += 1) {
      const president = state.players[state.presidentIndex]!;
      const nominee = eligibleChancellorIds(state)[0]!;
      state = must(state, { type: "nominate", playerId: president.id, chancellorId: nominee });
      for (const player of state.players) {
        if (player.alive) state = must(state, { type: "vote", playerId: player.id, ballot: "ablehnen" });
      }
    }
    expect(state.electionTracker).toBe(0);
    expect(state.previousPresidentIndex).toBeNull();
    expect(state.previousChancellorIndex).toBeNull();
    expect(state.enactedVereinswohl).toHaveLength(2);
    expect(state.enactedVereinswohl.at(-1)?.chaos).toBe(true);
    expect(state.enactedVereinswohl[0]?.chaos).toBe(false);
    expect(state.phase).toBe("nominating");
    if (oldPresident !== null) expect(canBeChancellor(state, oldPresident)).toBe(true);
    if (oldChancellor !== null && oldChancellor !== state.presidentIndex) {
      expect(canBeChancellor(state, oldChancellor)).toBe(true);
    }
  });

  it("zieht bei drei Ablehnungen die oberste Karte ohne Sonderaktion", () => {
    const top = card("chaos-1", "eigeninteresse", "GEHEIME_NOTVORLAGE");
    const roles: Role[] = [
      "ehrliches_mitglied",
      "ehrliches_mitglied",
      "ehrliches_mitglied",
      "ehrliches_mitglied",
      "ehrliches_mitglied",
      "linientreuer",
      "linientreuer",
      "linientreuer",
      "nils",
    ];
    let state = fresh({ count: 9, roles, draw: [top, ...fascistDeck()] });
    expect(boardPowers(9)[0]).toBe("kassenpruefung");
    for (let round = 0; round < 3; round += 1) {
      const president = state.players[state.presidentIndex]!;
      state = must(state, {
        type: "nominate",
        playerId: president.id,
        chancellorId: eligibleChancellorIds(state)[0]!,
      });
      for (const player of state.players) {
        state = must(state, { type: "vote", playerId: player.id, ballot: "ablehnen" });
      }
    }
    expect(state.enactedEigeninteresse).toHaveLength(1);
    expect(state.enactedEigeninteresse[0]).toMatchObject({ id: "chaos-1", chaos: true, power: null });
    expect(state.phase).toBe("nominating");
    expect(state.pendingPower).toBeNull();
    expect(state.electionTracker).toBe(0);
    const view = projectView(state, "p0");
    expect(view.eigeninteresse[0]?.title).toBe("GEHEIME_NOTVORLAGE");
    expect(view.pendingPower).toBeNull();
  });
});

describe("Legislative, Geheimhaltung, Sieg", () => {
  it("zeigt gezogene Vorlagen nur Vorsitz und danach Kasse", () => {
    let state = fresh({
      roles: standardFive,
      draw: [
        card("A", "vereinswohl", "TITEL_A"),
        card("B", "eigeninteresse", "TITEL_B"),
        card("C", "vereinswohl", "TITEL_C"),
        card("D", "eigeninteresse", "TITEL_D"),
      ],
    });
    state = must(state, { type: "nominate", playerId: "p0", chancellorId: "p1" });
    for (const id of ["p0", "p1", "p2", "p3", "p4"]) {
      state = must(state, { type: "vote", playerId: id, ballot: "zustimmen" });
    }
    expect(projectView(state, "p0").hand?.map((entry) => entry.title)).toEqual(["TITEL_A", "TITEL_B", "TITEL_C"]);
    expect(projectView(state, "p1").hand).toBeNull();
    expect(JSON.stringify(projectView(state, "p2"))).not.toContain("TITEL_A");
    expect(JSON.stringify(projectView(state, "p4"))).not.toContain("TITEL_C");

    state = must(state, { type: "discard", playerId: "p0", policyId: "C" });
    expect(state.discardPile.map((entry) => entry.id)).toEqual(["C"]);
    expect(projectView(state, "p1").hand?.map((entry) => entry.id)).toEqual(["A", "B"]);
    expect(projectView(state, "p0").hand?.map((entry) => entry.id)).toEqual(["A", "B"]);
    expect(JSON.stringify(projectView(state, "p3"))).not.toContain("TITEL_A");
    expect(applyAction(state, { type: "enact", playerId: "p2", policyId: "A" }).ok).toBe(false);
    state = must(state, { type: "enact", playerId: "p1", policyId: "A" });
    expect(state.enactedVereinswohl[0]?.title).toBe("TITEL_A");
    expect(state.discardPile.map((entry) => entry.id)).toContain("B");
    expect(projectView(state, "p2").hand).toBeNull();
  });

  it("mischt den Ablagestapel unter die verbliebenen Karten", () => {
    let state = fresh({
      roles: standardFive,
      draw: [card("A", "vereinswohl", "TOP_A")],
      discard: [card("B", "eigeninteresse", "REST_B"), card("C", "vereinswohl", "REST_C")],
    });
    state = must(state, { type: "nominate", playerId: "p0", chancellorId: "p1" });
    for (const player of state.players) state = must(state, { type: "vote", playerId: player.id, ballot: "zustimmen" });
    expect(state.presidentHand[0]?.id).toBe("A");
    expect(state.presidentHand.map((entry) => entry.id).sort()).toEqual(["A", "B", "C"]);
    expect(state.discardPile).toEqual([]);
  });

  it("lässt fünf Vereinswohl-Beschlüsse gewinnen", () => {
    let state = fresh({ roles: standardFive, draw: vereinDeck() });
    for (let index = 0; index < 4; index += 1) {
      state = enactTop(state);
      expect(state.winner).toBeNull();
    }
    state = enactTop(state);
    expect(state.phase).toBe("game_over");
    expect(state.winner).toBe("verein");
    expect(state.winReason).toBe("vereinswohl_track");
    const view = projectView(state, "p2");
    expect(view.revealed).toHaveLength(5);
    expect(view.revealed?.find((player) => player.id === "p4")?.role).toBe("nils");
  });

  it("lässt Nils als Kassenwart erst ab drei Eigeninteresse-Beschlüssen gewinnen", () => {
    let early = fresh({ roles: standardFive, draw: fascistDeck(), president: 0 });
    early = pushFascist(early);
    early = pushFascist(early);
    expect(early.enactedEigeninteresse).toHaveLength(2);
    expect(early.phase).toBe("nominating");
    const chair = early.players[early.presidentIndex]!;
    expect(canBeChancellor(early, 4)).toBe(true);
    early = must(early, { type: "nominate", playerId: chair.id, chancellorId: "p4" });
    for (const player of early.players) early = must(early, { type: "vote", playerId: player.id, ballot: "zustimmen" });
    expect(early.phase).toBe("legislative_president");
    expect(early.winner).toBeNull();

    let late = fresh({ roles: standardFive, draw: fascistDeck(), president: 0 });
    late = pushFascist(late);
    late = pushFascist(late);
    late = enactTop(late);
    expect(late.pendingPower).toBe("tagesordnung");
    const peekPresident = late.players[late.presidentIndex]!.id;
    const peeked = projectView(late, peekPresident);
    expect(peeked.peek).toHaveLength(3);
    for (const player of late.players) {
      if (player.id === peekPresident) continue;
      expect(projectView(late, player.id).peek).toBeNull();
      for (const cardPeek of peeked.peek ?? []) {
        expect(JSON.stringify(projectView(late, player.id))).not.toContain(cardPeek.title);
      }
    }
    late = settle(late);
    const pile = late.drawPile.length;
    const president = late.players[late.presidentIndex]!;
    expect(president.id).not.toBe("p4");
    expect(canBeChancellor(late, 4)).toBe(true);
    late = must(late, { type: "nominate", playerId: president.id, chancellorId: "p4" });
    for (const player of late.players) late = must(late, { type: "vote", playerId: player.id, ballot: "zustimmen" });
    expect(late.phase).toBe("game_over");
    expect(late.winReason).toBe("nils_kassenwart");
    expect(late.drawPile).toHaveLength(pile);
    expect(projectView(late, "p0").winStamp).toBe("Kasse übernommen");
  });

  it("gewinnt mit sechs Eigeninteresse-Beschlüssen und ignoriert Nils als Vorsitz", () => {
    let state = fresh({ roles: standardFive, draw: fascistDeck() });
    for (let index = 0; index < 5; index += 1) state = pushFascist(state);
    expect(state.vetoUnlocked).toBe(true);
    expect(state.winner).toBeNull();
    expect(state.players.filter((player) => !player.alive)).toHaveLength(2);
    state = pushFascist(state);
    expect(state.winReason).toBe("eigeninteresse_track");
    expect(state.pendingPower).toBeNull();
  });
});

describe("Sonderaktionen und Veto", () => {
  it("wertet Nils bei der Kassenprüfung als Klüngel und Liberale als ehrlich", () => {
    const roles: Role[] = [
      "ehrliches_mitglied",
      "ehrliches_mitglied",
      "ehrliches_mitglied",
      "ehrliches_mitglied",
      "ehrliches_mitglied",
      "linientreuer",
      "linientreuer",
      "linientreuer",
      "nils",
    ];
    let state = fresh({ count: 9, roles, draw: fascistDeck(), president: 0 });
    state = enactTop(state);
    expect(state.pendingPower).toBe("kassenpruefung");
    const firstInspector = state.players[state.presidentIndex]!.id;
    const liberalTarget = firstInspector === "p0" ? "p1" : "p0";
    state = must(state, { type: "investigate", playerId: firstInspector, targetId: liberalTarget });
    const inspector = state.players.find((player) => (state.privateNotes[player.id]?.length ?? 0) > 0);
    if (!inspector) throw new Error("Keine Notiz");
    expect(state.privateNotes[inspector.id]?.[0]?.text).toContain("Ehrliches Mitglied");
    for (const player of state.players) {
      if (player.id === inspector.id) continue;
      expect(JSON.stringify(projectView(state, player.id))).not.toContain("Ehrliches Mitglied. Keine Hinweise");
    }

    state = enactTop(state);
    expect(state.pendingPower).toBe("kassenpruefung");
    const presidentId = state.players[state.presidentIndex]!.id;
    expect(presidentId).not.toBe("p8");
    state = must(state, { type: "investigate", playerId: presidentId, targetId: "p8" });
    expect(state.privateNotes[presidentId]?.at(-1)?.text).toContain("Klüngel");
    expect(state.privateNotes[presidentId]?.at(-1)?.text).not.toContain("ist Nils");
    const outsider = state.players.find((player) => (state.privateNotes[player.id]?.length ?? 0) === 0);
    expect(outsider).toBeTruthy();
    expect(JSON.stringify(projectView(state, outsider!.id))).not.toContain("Das kann ein linientreuer");
  });

  it("schließt Nils auf der Jahreshauptversammlung aus und beendet sonst nur die Mitgliedschaft", () => {
    let killed = fresh({ roles: standardFive, draw: fascistDeck() });
    killed = pushFascist(killed);
    killed = pushFascist(killed);
    killed = pushFascist(killed);
    killed = settle(killed);
    expect(killed.enactedEigeninteresse).toHaveLength(3);
    killed = enactTop(killed);
    expect(killed.pendingPower).toBe("nicht_entlastung");
    const chair = killed.players[killed.presidentIndex]!.id;
    killed = must(killed, { type: "exclude", playerId: chair, targetId: "p4" });
    expect(killed.winReason).toBe("nils_ausgeschlossen");
    expect(killed.players[4]?.alive).toBe(false);

    let other = fresh({ roles: standardFive, draw: fascistDeck() });
    other = pushFascist(other);
    other = pushFascist(other);
    other = pushFascist(other);
    other = settle(other);
    other = enactTop(other);
    const president = other.players[other.presidentIndex]!;
    const liberal = other.players.find((player) => player.alive && player.role === "ehrliches_mitglied" && player.id !== president.id);
    if (!liberal) throw new Error("Kein Liberales Mitglied");
    other = must(other, { type: "exclude", playerId: president.id, targetId: liberal.id });
    expect(other.winner).toBeNull();
    expect(other.players.find((player) => player.id === liberal.id)?.alive).toBe(false);
    expect(other.phase).toBe("nominating");
    expect(applyAction(other, { type: "vote", playerId: liberal.id, ballot: "zustimmen" }).ok).toBe(false);
    const nominee = eligibleChancellorIds(other).find((id) => id !== liberal.id);
    expect(nominee).toBeTruthy();
    expect(canBeChancellor(other, other.players.findIndex((player) => player.id === liberal.id))).toBe(false);

    expect(livingPlayers(other)).toBe(4);
    expect(canBeChancellor(other, other.previousChancellorIndex ?? -1)).toBe(false);
    if (other.previousPresidentIndex !== null && other.previousPresidentIndex !== other.presidentIndex) {
      expect(canBeChancellor(other, other.previousPresidentIndex)).toBe(true);
    }
  });

  it("kehrt nach einer geplatzten Sondersitzung zum nächsten Sitz des Einberufers zurück", () => {
    const roles: Role[] = [
      "ehrliches_mitglied",
      "ehrliches_mitglied",
      "ehrliches_mitglied",
      "ehrliches_mitglied",
      "linientreuer",
      "linientreuer",
      "nils",
    ];
    let state = fresh({ count: 7, roles, draw: fascistDeck(), president: 0 });
    state = pushFascist(state);
    expect(state.phase).toBe("nominating");
    state = enactTop(state);
    expect(state.pendingPower).toBe("kassenpruefung");
    state = settle(state);
    state = enactTop(state);
    expect(state.pendingPower).toBe("sondersitzung");
    const caller = state.presidentIndex;
    const target = (caller + 2) % 7;
    expect(state.players[target]?.alive).toBe(true);
    state = must(state, {
      type: "special_election",
      playerId: state.players[caller]!.id,
      targetId: state.players[target]!.id,
    });
    expect(state.presidentIndex).toBe(target);
    expect(state.specialElectionCallerIndex).toBe(caller);
    expect(projectView(state, "p0").specialElectionNote).toContain("Sondersitzung");
    const president = state.players[state.presidentIndex]!;
    state = must(state, {
      type: "nominate",
      playerId: president.id,
      chancellorId: eligibleChancellorIds(state)[0]!,
    });
    for (const player of state.players) {
      if (player.alive) state = must(state, { type: "vote", playerId: player.id, ballot: "ablehnen" });
    }
    expect(state.specialElectionCallerIndex).toBeNull();
    expect(state.presidentIndex).toBe((caller + 1) % 7);
    expect(state.phase).toBe("nominating");
  });

  it("verwirft auf Formfehler und löst bei Tracker 2 die Notverwaltung aus", () => {
    let state = fresh({ roles: standardFive, draw: fascistDeck() });
    for (let index = 0; index < 5; index += 1) state = pushFascist(state);
    expect(state.vetoUnlocked).toBe(true);
    for (let round = 0; round < 2; round += 1) {
      const president = state.players[state.presidentIndex]!;
      state = must(state, {
        type: "nominate",
        playerId: president.id,
        chancellorId: eligibleChancellorIds(state)[0]!,
      });
      for (const player of state.players) {
        if (player.alive) state = must(state, { type: "vote", playerId: player.id, ballot: "ablehnen" });
      }
    }
    expect(state.electionTracker).toBe(2);
    const marker = card("chaos-marker", "vereinswohl", "NOTVERWALTUNG_MARKER");
    state.drawPile = [
      card("h1", "eigeninteresse", "HAND_1"),
      card("h2", "eigeninteresse", "HAND_2"),
      card("h3", "eigeninteresse", "HAND_3"),
      marker,
      ...state.drawPile,
    ];
    const president = state.players[state.presidentIndex]!;
    state = must(state, {
      type: "nominate",
      playerId: president.id,
      chancellorId: eligibleChancellorIds(state)[0]!,
    });
    for (const player of state.players) {
      if (player.alive) state = must(state, { type: "vote", playerId: player.id, ballot: "zustimmen" });
    }
    expect(state.electionTracker).toBe(2);
    expect(state.phase).toBe("legislative_president");
    const discardId = state.presidentHand.at(-1)!.id;
    state = must(state, { type: "discard", playerId: president.id, policyId: discardId });
    const chancellor = state.players[state.chancellorIndex!]!;
    expect(applyAction(state, { type: "request_veto", playerId: president.id }).ok).toBe(false);
    state = must(state, { type: "request_veto", playerId: chancellor.id });
    expect(state.phase).toBe("veto_request");
    state = must(state, { type: "resolve_veto", playerId: president.id, accept: true });
    expect(state.enactedVereinswohl.at(-1)?.id).toBe("chaos-marker");
    expect(state.enactedVereinswohl.at(-1)?.chaos).toBe(true);
    expect(state.electionTracker).toBe(0);
    expect(state.previousPresidentIndex).toBeNull();
    expect(state.phase).toBe("nominating");
  });

  it("zwingt die Kasse nach abgelehnter Formfehler-Rüge zum Beschluss", () => {
    let state = fresh({ roles: standardFive, draw: fascistDeck() });
    for (let index = 0; index < 5; index += 1) state = pushFascist(state);
    state = must(state, {
      type: "nominate",
      playerId: state.players[state.presidentIndex]!.id,
      chancellorId: eligibleChancellorIds(state)[0]!,
    });
    const presidentId = state.players[state.presidentIndex]!.id;
    for (const player of state.players) {
      if (player.alive) state = must(state, { type: "vote", playerId: player.id, ballot: "zustimmen" });
    }
    state = must(state, { type: "discard", playerId: presidentId, policyId: state.presidentHand.at(-1)!.id });
    const chancellorId = state.players[state.chancellorIndex!]!.id;
    const kept = state.chancellorHand[0]!.id;
    state = must(state, { type: "request_veto", playerId: chancellorId });
    state = must(state, { type: "resolve_veto", playerId: presidentId, accept: false });
    expect(state.phase).toBe("legislative_chancellor");
    expect(applyAction(state, { type: "request_veto", playerId: chancellorId }).ok).toBe(false);
    const enacted = state.enactedEigeninteresse.length;
    state = must(state, { type: "enact", playerId: chancellorId, policyId: kept });
    expect(state.enactedEigeninteresse.length).toBe(enacted + 1);
    expect(state.winReason).toBe("eigeninteresse_track");
  });
});

describe("Timeouts, Illegalität, Durchspielen", () => {
  it("lässt Originalzustand bei Regelverstößen unangetastet", () => {
    const state = fresh({ roles: standardFive, draw: vereinDeck() });
    const snapshot = structuredClone(state);
    expect(applyAction(state, { type: "nominate", playerId: "p1", chancellorId: "p2" }).ok).toBe(false);
    expect(applyAction(state, { type: "nominate", playerId: "p0", chancellorId: "p0" }).ok).toBe(false);
    expect(applyAction(state, { type: "vote", playerId: "p0", ballot: "zustimmen" }).ok).toBe(false);
    expect(state).toEqual(snapshot);
  });

  it("entscheidet hängende Züge kommissarisch", () => {
    let state = fresh({ roles: standardFive, draw: vereinDeck() });
    const skipped = applyTimeout(state);
    if (!skipped.ok) throw new Error(skipped.error);
    state = skipped.state;
    expect(state.electionTracker).toBe(1);
    expect(state.presidentIndex).toBe(1);

    state = must(state, {
      type: "nominate",
      playerId: "p1",
      chancellorId: eligibleChancellorIds(state)[0]!,
    });
    state = must(state, { type: "vote", playerId: "p0", ballot: "zustimmen" });
    state = must(state, { type: "vote", playerId: "p1", ballot: "zustimmen" });
    state = must(state, { type: "vote", playerId: "p2", ballot: "zustimmen" });
    const timed = applyTimeout(state);
    if (!timed.ok) throw new Error(timed.error);
    expect(timed.state.lastElection).toEqual({ ja: 3, nein: 2, passed: true });
    expect(timed.state.phase).toBe("legislative_president");

    const briefing = createGame(people(5), { seed: 1, roleOrder: standardFive, firstPresidentIndex: 0, drawPile: vereinDeck() });
    const opened = applyTimeout(briefing);
    if (!opened.ok) throw new Error(opened.error);
    expect(opened.state.phase).toBe("nominating");
  });

  it("spielt zufällige Partien bis zum Ende durch", () => {
    for (const count of [5, 6, 7, 8, 9, 10]) {
      for (let seed = 1; seed <= 6; seed += 1) {
        let state = createGame(people(count), { seed: seed * 17 + count });
        let guard = 0;
        let cursor = seed;
        while (state.phase !== "game_over" && guard < 700) {
          guard += 1;
          cursor = (cursor * 1664525 + 1013904223) >>> 0;
          if (cursor % 7 === 0) {
            const timed = applyTimeout(state);
            expect(timed.ok).toBe(true);
            if (timed.ok) state = timed.state;
            continue;
          }
          const options = listLegalActions(state);
          expect(options.length).toBeGreaterThan(0);
          const action = options[cursor % options.length];
          if (!action) throw new Error("Keine legale Aktion");
          const next = applyAction(state, action);
          expect(next.ok).toBe(true);
          if (next.ok) state = next.state;
        }
        expect(state.phase).toBe("game_over");
        expect(state.winner).not.toBeNull();
        const liberal = state.players.find((player) => player.role === "ehrliches_mitglied");
        if (liberal && state.players.some((player) => player.alive)) {
          const beforeReveal = state.phase;
          expect(beforeReveal).toBe("game_over");
        }
        for (const player of state.players) {
          const view = projectView(state, player.id);
          expect(view.revealed).toHaveLength(count);
          expect(JSON.stringify(view)).not.toContain('"drawPile"');
          expect(JSON.stringify(view)).not.toContain('"rng"');
        }
      }
    }
  });
});

describe("Namen und Raumcodes", () => {
  it("säubert Anzeigenamen und Raumcodes", () => {
    expect(sanitizeName("  Anna   Beispiel ")).toBe("Anna Beispiel");
    expect(sanitizeName("A")).toBeNull();
    expect(sanitizeName("x".repeat(21))).toBeNull();
    expect(sanitizeName("Ok\u202Eevom")).toBe("Okevom");
    expect(normalizeRoomCode(" k7mp ")).toBe("K7MP");
    expect(normalizeRoomCode("K7M0")).toBeNull();
    expect(normalizeRoomCode("IIII")).toBeNull();
    expect(normalizeRoomCode("AB")).toBeNull();
  });
});

function livingPlayers(state: GameState): number {
  return state.players.filter((player) => player.alive).length;
}
