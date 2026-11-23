import { listLegalActions } from "./engine";
import { nilsKnowsStaff } from "./roles";
import type { EngineAction, GameState, Player, PolicyCard, PolicyType } from "./types";

/** Unter fünf Personen füllt ein Probespiel auf diese Tischgröße auf. */
export const PROBE_TABLE_SIZE = 5;

const NPC_NAMES = ["Inge Platzhalter", "Uwe Platzhalter", "Heike Platzhalter", "Bernd Platzhalter"] as const;

/** Freie Platzhalternamen, die noch nicht am Tisch sitzen. */
export function npcSeatNames(taken: readonly string[], missing: number): string[] {
  if (missing <= 0) return [];
  const used = new Set(taken.map((name) => name.toLowerCase()));
  const picked: string[] = [];
  for (const name of NPC_NAMES) {
    if (picked.length >= missing) break;
    if (used.has(name.toLowerCase())) continue;
    picked.push(name);
    used.add(name.toLowerCase());
  }
  let number = 1;
  while (picked.length < missing) {
    const name = `Platzhalter ${number}`;
    number += 1;
    if (used.has(name.toLowerCase())) continue;
    picked.push(name);
    used.add(name.toLowerCase());
  }
  return picked;
}

/**
 * Nächster legaler Zug eines Platzhalters.
 * Kennt die eigene Rolle, weil der Server die Figur führt. Liefert null, wenn kein Platzhalter dran ist.
 */
export function chooseNpcAction(state: GameState, npcIds: ReadonlySet<string>): EngineAction | null {
  if (npcIds.size === 0 || state.phase === "game_over") return null;
  const legal = listLegalActions(state).filter((action) => npcIds.has(action.playerId));
  const first = legal[0];
  if (!first) return null;
  const mine = legal.filter((action) => action.playerId === first.playerId);
  const player = state.players.find((entry) => entry.id === first.playerId);
  if (!player) return null;
  return prefer(state, player, mine);
}

function prefer(state: GameState, player: Player, actions: EngineAction[]): EngineAction {
  const allies = knownKluengelIds(state, player);
  const liberal = player.role === "ehrliches_mitglied";
  const wanted: PolicyType = liberal ? "vereinswohl" : "eigeninteresse";

  const nominate = actions.find((action) => action.type === "nominate");
  if (nominate && nominate.type === "nominate") {
    const ids = actions.flatMap((action) => (action.type === "nominate" ? [action.chancellorId] : []));
    return { type: "nominate", playerId: player.id, chancellorId: chooseNominee(state, player, ids, allies, liberal) };
  }

  const vote = actions.find((action) => action.type === "vote");
  if (vote && vote.type === "vote") {
    const nominee = state.nominatedChancellorIndex === null ? undefined : state.players[state.nominatedChancellorIndex];
    const ballot =
      nominee && !liberal && !isKnownKluengel(state, player, nominee) && !allies.has(nominee.id)
        ? "ablehnen"
        : nominee && liberal && suspiciousIds(state, player.id).has(nominee.id)
          ? "ablehnen"
          : "zustimmen";
    return { type: "vote", playerId: player.id, ballot };
  }

  if (actions.some((action) => action.type === "discard")) {
    const dump = discardCandidate(state.presidentHand, wanted);
    return { type: "discard", playerId: player.id, policyId: dump.id };
  }

  if (actions.some((action) => action.type === "enact")) {
    const useful = state.chancellorHand.some((card) => card.type === wanted);
    if (!useful && actions.some((action) => action.type === "request_veto")) {
      return { type: "request_veto", playerId: player.id };
    }
    const keep = state.chancellorHand.find((card) => card.type === wanted) ?? state.chancellorHand[0];
    if (!keep) return actions[0]!;
    return { type: "enact", playerId: player.id, policyId: keep.id };
  }

  const veto = actions.find((action) => action.type === "resolve_veto");
  if (veto && veto.type === "resolve_veto") {
    const useful = state.chancellorHand.some((card) => card.type === wanted);
    return { type: "resolve_veto", playerId: player.id, accept: !useful };
  }

  const investigate = actions.find((action) => action.type === "investigate");
  if (investigate && investigate.type === "investigate") {
    const ids = actions.flatMap((action) => (action.type === "investigate" ? [action.targetId] : []));
    const known = suspiciousIds(state, player.id);
    const targetId = ids.find((id) => !known.has(id) && !allies.has(id)) ?? ids[0]!;
    return { type: "investigate", playerId: player.id, targetId };
  }

  const special = actions.find((action) => action.type === "special_election");
  if (special && special.type === "special_election") {
    const ids = actions.flatMap((action) => (action.type === "special_election" ? [action.targetId] : []));
    const ally = ids.find((id) => allies.has(id));
    return { type: "special_election", playerId: player.id, targetId: !liberal && ally ? ally : ids[0]! };
  }

  const exclude = actions.find((action) => action.type === "exclude");
  if (exclude && exclude.type === "exclude") {
    return { type: "exclude", playerId: player.id, targetId: chooseExclusion(state, player, actions, allies, liberal) };
  }

  return actions[0]!;
}

function chooseNominee(
  state: GameState,
  player: Player,
  ids: string[],
  allies: Set<string>,
  liberal: boolean,
): string {
  if (!liberal && state.enactedEigeninteresse.length >= 3) {
    const nils = state.players.find((entry) => entry.role === "nils" && ids.includes(entry.id));
    if (nils) return nils.id;
  }
  if (!liberal) {
    const ally = ids.find((id) => allies.has(id));
    if (ally) return ally;
  }
  const suspicious = suspiciousIds(state, player.id);
  return ids.find((id) => !suspicious.has(id)) ?? ids[0]!;
}

function chooseExclusion(
  state: GameState,
  player: Player,
  actions: EngineAction[],
  allies: Set<string>,
  liberal: boolean,
): string {
  const ids = actions.flatMap((action) => (action.type === "exclude" ? [action.targetId] : []));
  const nilsId = state.players.find((entry) => entry.role === "nils")?.id;
  let pool = ids;
  if (!liberal) {
    pool = pool.filter((id) => id !== nilsId && !allies.has(id));
    const honest = pool.find((id) => state.players.find((entry) => entry.id === id)?.role === "ehrliches_mitglied");
    if (honest) return honest;
  } else {
    const suspicious = suspiciousIds(state, player.id);
    const hit = pool.find((id) => suspicious.has(id));
    if (hit) return hit;
  }
  return pool[0] ?? ids.find((id) => id !== nilsId) ?? ids[0]!;
}

function discardCandidate(hand: PolicyCard[], wanted: PolicyType): PolicyCard {
  return hand.find((card) => card.type !== wanted) ?? hand[0]!;
}

function knownKluengelIds(state: GameState, player: Player): Set<string> {
  const ids = new Set<string>();
  if (player.role === "linientreuer") {
    for (const other of state.players) {
      if (other.id !== player.id && other.role !== "ehrliches_mitglied") ids.add(other.id);
    }
  } else if (player.role === "nils" && nilsKnowsStaff(state.boardSize)) {
    for (const other of state.players) {
      if (other.role === "linientreuer") ids.add(other.id);
    }
  }
  return ids;
}

function isKnownKluengel(state: GameState, player: Player, nominee: Player): boolean {
  if (nominee.role === "ehrliches_mitglied") return false;
  if (player.role === "linientreuer") return true;
  if (player.role === "nils") return nilsKnowsStaff(state.boardSize) || nominee.role === "nils";
  return false;
}

function suspiciousIds(state: GameState, playerId: string): Set<string> {
  const ids = new Set<string>();
  for (const note of state.privateNotes[playerId] ?? []) {
    if (!note.text.includes("Klüngel")) continue;
    for (const player of state.players) {
      if (note.text.includes(player.name)) ids.add(player.id);
    }
  }
  return ids;
}
