import { createCatalog, EIGENINTERESSE_BEFORE_NILS, EIGENINTERESSE_TO_WIN, VEREINSWOHL_TO_WIN, VETO_UNLOCK_AT } from "./deck";
import { pickIndex, shuffle } from "./rng";
import { boardPowers, compositionSentence, factionOf, nilsKnowsStaff, powerOnSlot, roleBag, roleCounts } from "./roles";
import type {
  ApplyResult,
  Ballot,
  ClientAction,
  CreateGameOptions,
  CreatePlayerInput,
  EngineAction,
  EnactedPolicy,
  ExecutivePower,
  Faction,
  GameState,
  Phase,
  Player,
  PolicyCard,
  Role,
  WinReason,
} from "./types";

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

function assertPhase(state: GameState, phase: Phase): void {
  if (state.phase !== phase) {
    throw new RuleError("Dafür ist jetzt nicht der richtige Tagesordnungspunkt.");
  }
}

function playerById(state: GameState, playerId: string): Player {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) throw new RuleError("Dieses Mitglied sitzt nicht in der Versammlung.");
  return player;
}

function indexOf(state: GameState, playerId: string): number {
  const index = state.players.findIndex((entry) => entry.id === playerId);
  if (index < 0) throw new RuleError("Dieses Mitglied sitzt nicht in der Versammlung.");
  return index;
}

function president(state: GameState): Player {
  const player = state.players[state.presidentIndex];
  if (!player) throw new RuleError("Der Vorsitz ist unbesetzt.");
  return player;
}

function requirePresident(state: GameState, playerId: string): Player {
  const player = president(state);
  if (player.id !== playerId) throw new RuleError("Du bist nicht der 1. Vorsitzende.");
  if (!player.alive) throw new RuleError("Du bist nicht mehr im Amt.");
  return player;
}

function living(state: GameState): Player[] {
  return state.players.filter((player) => player.alive);
}

export function livingCount(state: GameState): number {
  return living(state).length;
}

function nextLivingIndex(state: GameState, fromIndex: number): number {
  const total = state.players.length;
  for (let step = 1; step <= total; step += 1) {
    const index = (fromIndex + step) % total;
    if (state.players[index]?.alive) return index;
  }
  throw new RuleError("Es ist niemand mehr beschlussfähig.");
}

function log(state: GameState, text: string, tone: GameState["log"][number]["tone"] = "info"): void {
  state.logSeq += 1;
  state.log.push({ id: state.logSeq, text, tone });
  if (state.log.length > 240) state.log.splice(0, state.log.length - 240);
}

function addNote(state: GameState, playerId: string, kind: "kassenpruefung" | "tagesordnung", text: string): void {
  state.noteSeq += 1;
  const notes = state.privateNotes[playerId] ?? [];
  notes.push({ id: state.noteSeq, kind, text });
  state.privateNotes[playerId] = notes.slice(-20);
}

function endGame(state: GameState, winner: Faction, reason: WinReason): void {
  state.phase = "game_over";
  state.winner = winner;
  state.winReason = reason;
  state.pendingPower = null;
  state.pendingPeek = null;
  state.presidentHand = [];
  state.chancellorHand = [];
  log(state, victoryLine(state, reason), winner === "verein" ? "good" : "bad");
}

function victoryLine(state: GameState, reason: WinReason): string {
  const nils = state.players.find((player) => player.role === "nils");
  const name = nils?.name ?? "Nils";
  switch (reason) {
    case "vereinswohl_track":
      return "Fünf Vereinswohl-Beschlüsse. Der Club bleibt transparent — die ehrlichen Mitglieder gewinnen.";
    case "nils_ausgeschlossen":
      return `${name} war Nils und ist ausgeschlossen. Die ehrlichen Mitglieder gewinnen.`;
    case "eigeninteresse_track":
      return "Sechs Eigeninteresse-Beschlüsse. Der Klüngel hat den Verein übernommen.";
    case "nils_kassenwart":
      return `${name} ist Nils und sitzt an der Kasse. Nach ${state.enactedEigeninteresse.length} Eigeninteresse-Beschlüssen gewinnt der Klüngel.`;
  }
}

function clearHands(state: GameState): void {
  state.presidentHand = [];
  state.chancellorHand = [];
  state.vetoDenied = false;
  state.pendingPower = null;
  state.pendingPeek = null;
}

/** Nächster Vorsitz. Eine laufende Sondersitzung endet hier und kehrt zum einberufenden Sitz zurück. */
function advanceChair(state: GameState): void {
  if (state.specialElectionCallerIndex !== null) {
    const caller = state.specialElectionCallerIndex;
    state.specialElectionCallerIndex = null;
    state.presidentIndex = nextLivingIndex(state, caller);
  } else {
    state.presidentIndex = nextLivingIndex(state, state.presidentIndex);
  }
  state.chancellorIndex = null;
  state.nominatedChancellorIndex = null;
  clearHands(state);
  state.phase = "nominating";
}

function ensureDraw(state: GameState, count: number): void {
  if (state.drawPile.length >= count) return;
  if (state.discardPile.length === 0) {
    throw new RuleError("Im Stapel liegen nicht genug Beschlussvorlagen.");
  }
  const shuffled = shuffle(state.discardPile, state.rng);
  state.rng = shuffled.rng;
  state.drawPile = [...state.drawPile, ...shuffled.result];
  state.discardPile = [];
}

function draw(state: GameState, count: number): PolicyCard[] {
  ensureDraw(state, count);
  if (state.drawPile.length < count) {
    throw new RuleError("Im Stapel liegen nicht genug Beschlussvorlagen.");
  }
  const cards = state.drawPile.slice(0, count);
  state.drawPile = state.drawPile.slice(count);
  return cards;
}

type EnactOutcome = "continue" | "executive" | "game_over";

function placePolicy(state: GameState, card: PolicyCard, chaos: boolean): EnactOutcome {
  const record: EnactedPolicy = { ...card, chaos, power: null };
  if (card.type === "vereinswohl") {
    state.enactedVereinswohl.push(record);
    state.electionTracker = 0;
    log(
      state,
      chaos
        ? `Notverwaltung: Vereinswohl-Beschluss „${card.title}“ tritt in Kraft.`
        : `Beschlossen: Vereinswohl — „${card.title}“.`,
      "good",
    );
    if (state.enactedVereinswohl.length >= VEREINSWOHL_TO_WIN) {
      endGame(state, "verein", "vereinswohl_track");
      return "game_over";
    }
    return "continue";
  }

  state.enactedEigeninteresse.push(record);
  const slot = state.enactedEigeninteresse.length;
  if (slot >= VETO_UNLOCK_AT) state.vetoUnlocked = true;
  const power: ExecutivePower = chaos || slot > 5 ? "none" : powerOnSlot(state.boardSize, slot);
  record.power = power === "none" ? null : power;
  state.electionTracker = 0;

  const powerText =
    !chaos && power !== "none" ? ` Sonderaktion: ${powerNameInline(power)}.` : chaos ? " Ohne Sonderaktion." : "";
  log(
    state,
    chaos
      ? `Notverwaltung: Eigeninteresse-Beschluss „${card.title}“ tritt in Kraft.${powerText}`
      : `Beschlossen: Eigeninteresse — „${card.title}“.${powerText}`,
    "bad",
  );

  if (slot >= EIGENINTERESSE_TO_WIN) {
    endGame(state, "kluengel", "eigeninteresse_track");
    return "game_over";
  }
  if (power !== "none") {
    state.pendingPower = power;
    state.phase = "executive";
    if (power === "tagesordnung") preparePeek(state);
    return "executive";
  }
  return "continue";
}

function powerNameInline(power: ExecutivePower): string {
  switch (power) {
    case "kassenpruefung":
      return "Kassenprüfung";
    case "sondersitzung":
      return "Sondersitzung";
    case "tagesordnung":
      return "Tagesordnung einsehen";
    case "nicht_entlastung":
      return "Jahreshauptversammlung (Nicht-Entlastung)";
    default:
      return "keine";
  }
}

function preparePeek(state: GameState): void {
  ensureDraw(state, 3);
  state.pendingPeek = state.drawPile.slice(0, Math.min(3, state.drawPile.length)).map((card) => ({ ...card }));
}

function finishRound(state: GameState): void {
  advanceChair(state);
}

function enterChaos(state: GameState): void {
  const [card] = draw(state, 1);
  if (!card) throw new RuleError("Die Notverwaltung findet keine Vorlage.");
  const outcome = placePolicy(state, card, true);
  state.previousPresidentIndex = null;
  state.previousChancellorIndex = null;
  state.nominatedChancellorIndex = null;
  state.chancellorIndex = null;
  if (outcome === "game_over") return;
  finishRound(state);
}

function advanceTracker(state: GameState, cause: string): void {
  state.electionTracker += 1;
  state.nominatedChancellorIndex = null;
  state.chancellorIndex = null;
  state.presidentHand = [];
  state.chancellorHand = [];
  state.vetoDenied = false;
  if (state.electionTracker >= 3) {
    log(state, `${cause} Der Tracker steht auf 3. Kommissarische Notverwaltung.`, "bad");
    enterChaos(state);
    return;
  }
  const open = 3 - state.electionTracker;
  log(
    state,
    `${cause} Notverwaltung ${state.electionTracker}/3 — noch ${open} gescheiterte Beschlussfassung${open === 1 ? "" : "en"}.`,
    "warn",
  );
  finishRound(state);
}

export function canBeChancellor(state: GameState, index: number): boolean {
  const player = state.players[index];
  if (!player?.alive) return false;
  if (index === state.presidentIndex) return false;
  if (state.previousChancellorIndex === index) return false;
  if (livingCount(state) >= 5 && state.previousPresidentIndex === index) return false;
  return true;
}

export function eligibleChancellorIds(state: GameState): string[] {
  return state.players.filter((_, index) => canBeChancellor(state, index)).map((player) => player.id);
}

function otherLivingIds(state: GameState, exceptIndex: number): string[] {
  return state.players.filter((player, index) => player.alive && index !== exceptIndex).map((player) => player.id);
}

function ballotSnapshot(state: GameState): { playerId: string; ballot: Ballot }[] {
  return living(state).map((player) => {
    const ballot = state.votes[player.id];
    if (!ballot) throw new RuleError("Es fehlt noch eine Stimmkarte.");
    return { playerId: player.id, ballot };
  });
}

function describeBallots(state: GameState, ballots: { playerId: string; ballot: Ballot }[]): string {
  const nameOf = (id: string) => state.players.find((player) => player.id === id)?.name ?? "Unbekannt";
  const ja = ballots.filter((entry) => entry.ballot === "zustimmen").map((entry) => nameOf(entry.playerId));
  const nein = ballots.filter((entry) => entry.ballot === "ablehnen").map((entry) => nameOf(entry.playerId));
  return `Zustimmung: ${ja.join(", ") || "niemand"}. Ablehnung: ${nein.join(", ") || "niemand"}.`;
}

function resolveElection(state: GameState, autoNeinNames: string[]): void {
  const ballots = ballotSnapshot(state);
  const ja = ballots.filter((entry) => entry.ballot === "zustimmen").length;
  const nein = ballots.filter((entry) => entry.ballot === "ablehnen").length;
  const passed = ja > nein;
  state.lastBallots = ballots;
  state.lastElection = { ja, nein, passed };
  state.votes = {};
  const nomineeIndex = state.nominatedChancellorIndex;
  const nominee = nomineeIndex === null ? undefined : state.players[nomineeIndex];
  if (!nominee || nomineeIndex === null) throw new RuleError("Es liegt kein Wahlvorschlag vor.");

  if (autoNeinNames.length > 0) {
    log(state, `Keine Stimmkarte abgegeben, zählt als Ablehnung: ${autoNeinNames.join(", ")}.`, "warn");
  }
  log(state, describeBallots(state, ballots), "info");

  if (!passed) {
    log(state, `Die Versammlung lehnt ${nominee.name} als Kassenwart ab (${ja} : ${nein}).`, "warn");
    advanceTracker(state, "Die Wahl ist geplatzt.");
    return;
  }

  state.previousPresidentIndex = state.presidentIndex;
  state.previousChancellorIndex = nomineeIndex;
  state.chancellorIndex = nomineeIndex;
  log(state, `${nominee.name} ist als Kassenwart bestätigt (${ja} : ${nein}).`, "good");

  if (nominee.role === "nils" && state.enactedEigeninteresse.length >= EIGENINTERESSE_BEFORE_NILS) {
    endGame(state, "kluengel", "nils_kassenwart");
    return;
  }

  state.presidentHand = draw(state, 3);
  state.chancellorHand = [];
  state.vetoDenied = false;
  state.phase = "legislative_president";
  log(state, `${president(state).name} sichtet drei Beschlussvorlagen. Eine davon wandert in den Reißwolf.`, "info");
}

function validateRoleOrder(roleOrder: Role[], count: number): void {
  const expected = roleCounts(count);
  const ehrlich = roleOrder.filter((role) => role === "ehrliches_mitglied").length;
  const linientreu = roleOrder.filter((role) => role === "linientreuer").length;
  const nils = roleOrder.filter((role) => role === "nils").length;
  if (roleOrder.length !== count || ehrlich !== expected.ehrlich || linientreu !== expected.linientreu || nils !== expected.nils) {
    throw new RuleError("Die Rollenverteilung passt nicht zur Mitgliederzahl.");
  }
}

export function createGame(players: CreatePlayerInput[], options: CreateGameOptions = {}): GameState {
  if (players.length < 5 || players.length > 10) {
    throw new RuleError("Secret Nils braucht 5 bis 10 Mitglieder.");
  }
  const ids = new Set<string>();
  for (const player of players) {
    if (!player.id || ids.has(player.id)) throw new RuleError("Jedes Mitglied braucht eine eigene Kennung.");
    ids.add(player.id);
    if (!player.name?.trim()) throw new RuleError("Jedes Mitglied braucht einen Namen.");
  }

  let rng = { seed: options.seed ?? 1 };
  let ordered = players.map((player) => ({ id: player.id, name: player.name.trim() }));
  if (options.sitzeMischen && !options.roleOrder) {
    const mixed = shuffle(ordered, rng);
    ordered = mixed.result;
    rng = mixed.rng;
  }

  let roles: Role[];
  if (options.roleOrder) {
    validateRoleOrder(options.roleOrder, ordered.length);
    roles = options.roleOrder.slice();
  } else {
    const dealt = shuffle(roleBag(ordered.length), rng);
    roles = dealt.result;
    rng = dealt.rng;
  }

  const seated: Player[] = ordered.map((player, seat) => ({
    id: player.id,
    name: player.name,
    seat,
    role: roles[seat] ?? "ehrliches_mitglied",
    alive: true,
    npc: false,
  }));

  let drawPile: PolicyCard[];
  if (options.drawPile) {
    drawPile = options.drawPile.map((card) => ({ ...card }));
  } else {
    const dealt = shuffle(createCatalog(), rng);
    drawPile = dealt.result;
    rng = dealt.rng;
  }

  const count = seated.length;
  let presidentIndex = options.firstPresidentIndex ?? 0;
  if (options.firstPresidentIndex === undefined) {
    const roll = pickIndex(count, rng);
    presidentIndex = roll.index;
    rng = roll.rng;
  }
  if (!seated[presidentIndex]) throw new RuleError("Der erste Vorsitz ist ungültig.");

  const privateNotes: GameState["privateNotes"] = {};
  const briefingAck: GameState["briefingAck"] = {};
  for (const player of seated) {
    privateNotes[player.id] = [];
    briefingAck[player.id] = false;
  }

  const state: GameState = {
    boardSize: count,
    players: seated,
    rng,
    drawPile,
    discardPile: (options.discardPile ?? []).map((card) => ({ ...card })),
    enactedVereinswohl: [],
    enactedEigeninteresse: [],
    phase: "briefing",
    presidentIndex,
    chancellorIndex: null,
    nominatedChancellorIndex: null,
    previousPresidentIndex: null,
    previousChancellorIndex: null,
    electionTracker: 0,
    specialElectionCallerIndex: null,
    vetoUnlocked: false,
    vetoDenied: false,
    votes: {},
    lastBallots: null,
    lastElection: null,
    presidentHand: [],
    chancellorHand: [],
    pendingPower: null,
    pendingPeek: null,
    briefingAck,
    privateNotes,
    noteSeq: 0,
    winner: null,
    winReason: null,
    log: [],
    logSeq: 0,
  };

  const starter = seated[presidentIndex];
  log(state, `Gründungsversammlung eröffnet. ${compositionSentence(count)} Die Rollen bleiben verdeckt.`, "info");
  log(
    state,
    `Erster 1. Vorsitz: ${starter?.name ?? "Unbekannt"}. Danach wandert das Amt im Uhrzeigersinn.`,
    "info",
  );
  if (!nilsKnowsStaff(count)) {
    log(state, "In dieser Rundengröße kennt Nils die linientreuen Festangestellten nicht.", "info");
  }
  return state;
}

function ackBriefing(state: GameState, playerId: string): void {
  assertPhase(state, "briefing");
  const player = playerById(state, playerId);
  if (!player.alive) throw new RuleError("Du bist nicht mehr stimmberechtigt.");
  state.briefingAck[playerId] = true;
  if (state.players.every((entry) => !entry.alive || state.briefingAck[entry.id])) {
    state.phase = "nominating";
    log(state, "Alle Ausweise sind gelesen. Es beginnt die Wahl des Kassenwarts.", "info");
  }
}

function nominate(state: GameState, playerId: string, chancellorId: string): void {
  assertPhase(state, "nominating");
  requirePresident(state, playerId);
  const chancellorIndex = indexOf(state, chancellorId);
  if (!canBeChancellor(state, chancellorIndex)) {
    throw new RuleError("Diese Person kann gerade nicht Kassenwart werden.");
  }
  state.nominatedChancellorIndex = chancellorIndex;
  state.chancellorIndex = null;
  state.votes = {};
  state.phase = "voting";
  const nominee = state.players[chancellorIndex];
  log(state, `${president(state).name} schlägt ${nominee?.name ?? "jemanden"} als Kassenwart vor.`, "info");
}

function vote(state: GameState, playerId: string, ballot: Ballot): void {
  assertPhase(state, "voting");
  const player = playerById(state, playerId);
  if (!player.alive) throw new RuleError("Ausgeschlossene Mitglieder stimmen nicht mehr mit.");
  if (state.votes[playerId]) throw new RuleError("Deine Stimmkarte liegt schon auf dem Tisch.");
  if (ballot !== "zustimmen" && ballot !== "ablehnen") throw new RuleError("Ungültige Stimmkarte.");
  state.votes[playerId] = ballot;
  if (living(state).every((entry) => state.votes[entry.id])) {
    resolveElection(state, []);
  }
}

function discardPolicy(state: GameState, playerId: string, policyId: string): void {
  assertPhase(state, "legislative_president");
  requirePresident(state, playerId);
  const index = state.presidentHand.findIndex((card) => card.id === policyId);
  if (index < 0) throw new RuleError("Diese Vorlage liegt dir nicht vor.");
  const [discarded] = state.presidentHand.splice(index, 1);
  if (!discarded) throw new RuleError("Diese Vorlage liegt dir nicht vor.");
  state.discardPile.push(discarded);
  state.chancellorHand = state.presidentHand;
  state.presidentHand = [];
  state.phase = "legislative_chancellor";
  const chancellor = state.chancellorIndex === null ? undefined : state.players[state.chancellorIndex];
  log(
    state,
    `${president(state).name} gibt zwei Vorlagen an Kassenwart ${chancellor?.name ?? ""}. Eine liegt im Reißwolf.`.trim(),
    "info",
  );
}

function enactPolicy(state: GameState, playerId: string, policyId: string): void {
  assertPhase(state, "legislative_chancellor");
  const chancellor = state.chancellorIndex === null ? undefined : state.players[state.chancellorIndex];
  if (!chancellor || chancellor.id !== playerId) throw new RuleError("Nur der Kassenwart setzt Beschlüsse um.");
  const index = state.chancellorHand.findIndex((card) => card.id === policyId);
  if (index < 0) throw new RuleError("Diese Vorlage liegt dir nicht vor.");
  const chosen = state.chancellorHand[index];
  if (!chosen) throw new RuleError("Diese Vorlage liegt dir nicht vor.");
  const rest = state.chancellorHand.filter((card) => card.id !== policyId);
  state.discardPile.push(...rest);
  state.chancellorHand = [];
  state.presidentHand = [];
  const outcome = placePolicy(state, chosen, false);
  if (outcome === "continue") finishRound(state);
}

function requestVeto(state: GameState, playerId: string): void {
  assertPhase(state, "legislative_chancellor");
  const chancellor = state.chancellorIndex === null ? undefined : state.players[state.chancellorIndex];
  if (!chancellor || chancellor.id !== playerId) throw new RuleError("Nur der Kassenwart kann Formfehler rügen.");
  if (!state.vetoUnlocked) throw new RuleError("Das Vetorecht gilt erst nach dem fünften Eigeninteresse-Beschluss.");
  if (state.vetoDenied) throw new RuleError("Der Vorsitz hat die Rüge zurückgewiesen. Du musst einen Beschluss umsetzen.");
  state.phase = "veto_request";
  log(state, `${chancellor.name} rügt die Vorlagen als Formfehler und bittet den Vorsitz um Zustimmung.`, "warn");
}

function resolveVeto(state: GameState, playerId: string, accept: boolean): void {
  assertPhase(state, "veto_request");
  requirePresident(state, playerId);
  if (!accept) {
    state.vetoDenied = true;
    state.phase = "legislative_chancellor";
    log(state, `${president(state).name} weist die Formfehler-Rüge zurück. Die Kasse muss umsetzen.`, "info");
    return;
  }
  state.discardPile.push(...state.chancellorHand);
  state.chancellorHand = [];
  log(state, `${president(state).name} stimmt zu. Beide Vorlagen gelten als satzungswidrig und wandern in den Reißwolf.`, "warn");
  advanceTracker(state, "Die Formfehler-Rüge ist durch.");
}

function livingTarget(state: GameState, actorId: string, targetId: string, selfMessage: string): number {
  requirePresident(state, actorId);
  if (actorId === targetId) throw new RuleError(selfMessage);
  const index = indexOf(state, targetId);
  const target = state.players[index];
  if (!target?.alive) throw new RuleError("Diese Person ist nicht mehr im Verein.");
  return index;
}

function investigate(state: GameState, playerId: string, targetId: string): void {
  assertPhase(state, "executive");
  if (state.pendingPower !== "kassenpruefung") throw new RuleError("Gerade steht keine Kassenprüfung an.");
  const index = livingTarget(state, playerId, targetId, "Die eigene Vereinsakte prüfst du nicht.");
  const target = state.players[index];
  if (!target) throw new RuleError("Diese Person ist nicht mehr im Verein.");
  const faction = factionOf(target.role);
  const text =
    faction === "verein"
      ? `Vereinsakte ${target.name}: Ehrliches Mitglied. Keine Hinweise auf den Klüngel.`
      : `Vereinsakte ${target.name}: Klüngel. Das kann ein linientreuer Festangestellter oder Nils sein.`;
  addNote(state, playerId, "kassenpruefung", text);
  log(state, `${president(state).name} hat die Vereinsakte von ${target.name} geprüft. Das Ergebnis bleibt vertraulich.`, "info");
  finishRound(state);
}

function specialElection(state: GameState, playerId: string, targetId: string): void {
  assertPhase(state, "executive");
  if (state.pendingPower !== "sondersitzung") throw new RuleError("Gerade steht keine Sondersitzung an.");
  const index = livingTarget(state, playerId, targetId, "Du kannst die Sondersitzung nicht auf dich selbst legen.");
  const caller = president(state);
  const target = state.players[index];
  state.specialElectionCallerIndex = state.presidentIndex;
  state.presidentIndex = index;
  state.chancellorIndex = null;
  state.nominatedChancellorIndex = null;
  clearHands(state);
  state.phase = "nominating";
  log(
    state,
    `${caller.name} beruft eine Sondersitzung ein. ${target?.name ?? "Jemand"} führt einmalig den Vorsitz. Danach geht es bei ${nextNameAfter(state, state.specialElectionCallerIndex)} weiter.`,
    "warn",
  );
}

function nextNameAfter(state: GameState, index: number | null): string {
  if (index === null) return "der Reihe";
  const next = state.players[nextLivingIndex(state, index)];
  return next?.name ?? "der Reihe";
}

function acknowledgePeek(state: GameState, playerId: string): void {
  assertPhase(state, "executive");
  if (state.pendingPower !== "tagesordnung") throw new RuleError("Gerade liegt keine Tagesordnung zur Einsicht vor.");
  requirePresident(state, playerId);
  const cards = state.pendingPeek ?? [];
  const list = cards.map((card, index) => `${index + 1}. ${card.title}`).join(" · ");
  addNote(state, playerId, "tagesordnung", `Oberste Tagesordnung: ${list || "keine Vorlagen"}`);
  log(state, `${president(state).name} hat die nächsten drei Tagesordnungspunkte verdeckt eingesehen.`, "info");
  finishRound(state);
}

function excludeMember(state: GameState, playerId: string, targetId: string): void {
  assertPhase(state, "executive");
  if (state.pendingPower !== "nicht_entlastung") {
    throw new RuleError("Gerade steht keine Jahreshauptversammlung an.");
  }
  const index = livingTarget(state, playerId, targetId, "Du kannst dir nicht selbst die Entlastung verweigern.");
  const target = state.players[index];
  if (!target) throw new RuleError("Diese Person ist nicht mehr im Verein.");
  target.alive = false;
  log(
    state,
    `Auf der außerordentlichen Jahreshauptversammlung wird ${target.name} nicht entlastet und aus dem Verein ausgeschlossen.`,
    "bad",
  );
  if (target.role === "nils") {
    endGame(state, "verein", "nils_ausgeschlossen");
    return;
  }
  log(state, `${target.name} scheidet aus. Rolle und Lager bleiben bis zum Ende der Sitzung verdeckt.`, "info");
  finishRound(state);
}

function reduce(state: GameState, action: EngineAction): void {
  if (state.phase === "game_over") throw new RuleError("Die Sitzung ist bereits beendet.");
  switch (action.type) {
    case "ack_briefing":
      ackBriefing(state, action.playerId);
      return;
    case "nominate":
      nominate(state, action.playerId, action.chancellorId);
      return;
    case "vote":
      vote(state, action.playerId, action.ballot);
      return;
    case "discard":
      discardPolicy(state, action.playerId, action.policyId);
      return;
    case "enact":
      enactPolicy(state, action.playerId, action.policyId);
      return;
    case "request_veto":
      requestVeto(state, action.playerId);
      return;
    case "resolve_veto":
      resolveVeto(state, action.playerId, action.accept);
      return;
    case "investigate":
      investigate(state, action.playerId, action.targetId);
      return;
    case "special_election":
      specialElection(state, action.playerId, action.targetId);
      return;
    case "ack_peek":
      acknowledgePeek(state, action.playerId);
      return;
    case "exclude":
      excludeMember(state, action.playerId, action.targetId);
      return;
    default: {
      const unreachable: never = action;
      throw new RuleError(`Unbekannte Aktion: ${JSON.stringify(unreachable)}`);
    }
  }
}

export function applyAction(previous: GameState, action: EngineAction): ApplyResult {
  const state = structuredClone(previous);
  try {
    if (!action || typeof action !== "object" || typeof action.playerId !== "string" || typeof action.type !== "string") {
      throw new RuleError("Unverständliche Aktion.");
    }
    reduce(state, action);
    return { ok: true, state };
  } catch (error) {
    if (error instanceof RuleError) return { ok: false, error: error.message };
    throw error;
  }
}

function pickPlayerId(state: GameState, ids: string[]): string {
  const roll = pickIndex(ids.length, state.rng);
  state.rng = roll.rng;
  const id = ids[roll.index];
  if (!id) throw new RuleError("Keine Person für die Notentscheidung.");
  return id;
}

function pickCard(state: GameState, cards: PolicyCard[]): PolicyCard {
  const roll = pickIndex(cards.length, state.rng);
  state.rng = roll.rng;
  const card = cards[roll.index];
  if (!card) throw new RuleError("Keine Vorlage für die Notentscheidung.");
  return card;
}

/** Server-Timeout. Hängt eine Runde nicht auf, verrät aber keine Geheimnisse. */
export function applyTimeout(previous: GameState): ApplyResult {
  const state = structuredClone(previous);
  try {
    if (state.phase === "game_over") throw new RuleError("Die Sitzung ist bereits beendet.");
    switch (state.phase) {
      case "briefing": {
        for (const player of state.players) {
          if (player.alive) state.briefingAck[player.id] = true;
        }
        state.phase = "nominating";
        log(state, "Die Ausweisrunde ist wegen Zeitüberschreitung geschlossen.", "warn");
        break;
      }
      case "nominating": {
        const name = president(state).name;
        advanceTracker(state, `${name} benennt niemanden (Zeitüberschreitung).`);
        break;
      }
      case "voting": {
        const missing = living(state).filter((player) => !state.votes[player.id]);
        for (const player of missing) state.votes[player.id] = "ablehnen";
        resolveElection(
          state,
          missing.map((player) => player.name),
        );
        break;
      }
      case "legislative_president": {
        const card = pickCard(state, state.presidentHand);
        discardPolicy(state, president(state).id, card.id);
        log(state, `${president(state).name} hat nicht rechtzeitig sortiert. Eine Vorlage wurde kommissarisch verworfen.`, "warn");
        break;
      }
      case "legislative_chancellor": {
        const chancellor = state.chancellorIndex === null ? undefined : state.players[state.chancellorIndex];
        if (!chancellor) throw new RuleError("Die Kasse ist unbesetzt.");
        const card = pickCard(state, state.chancellorHand);
        enactPolicy(state, chancellor.id, card.id);
        log(state, `${chancellor.name} hat nicht rechtzeitig beschlossen. Eine Vorlage wurde kommissarisch umgesetzt.`, "warn");
        break;
      }
      case "veto_request": {
        resolveVeto(state, president(state).id, false);
        log(state, "Die Formfehler-Rüge verfällt wegen Zeitüberschreitung.", "warn");
        break;
      }
      case "executive": {
        const actor = president(state);
        const targets = otherLivingIds(state, state.presidentIndex);
        if (state.pendingPower === "tagesordnung") {
          acknowledgePeek(state, actor.id);
          break;
        }
        const targetId = pickPlayerId(state, targets);
        if (state.pendingPower === "kassenpruefung") investigate(state, actor.id, targetId);
        else if (state.pendingPower === "sondersitzung") specialElection(state, actor.id, targetId);
        else if (state.pendingPower === "nicht_entlastung") excludeMember(state, actor.id, targetId);
        else throw new RuleError("Keine Sonderaktion für die Notentscheidung.");
        log(state, "Eine Sonderaktion wurde wegen Zeitüberschreitung kommissarisch ausgeführt.", "warn");
        break;
      }
      default:
        throw new RuleError("Keine Notentscheidung für diesen Tagesordnungspunkt.");
    }
    return { ok: true, state };
  } catch (error) {
    if (error instanceof RuleError) return { ok: false, error: error.message };
    throw error;
  }
}

export function listLegalActions(state: GameState): EngineAction[] {
  if (state.phase === "game_over") return [];
  const actions: EngineAction[] = [];
  const pres = president(state);

  switch (state.phase) {
    case "briefing":
      for (const player of living(state)) {
        if (!state.briefingAck[player.id]) actions.push({ type: "ack_briefing", playerId: player.id });
      }
      break;
    case "nominating":
      for (const id of eligibleChancellorIds(state)) {
        actions.push({ type: "nominate", playerId: pres.id, chancellorId: id });
      }
      break;
    case "voting":
      for (const player of living(state)) {
        if (state.votes[player.id]) continue;
        actions.push({ type: "vote", playerId: player.id, ballot: "zustimmen" });
        actions.push({ type: "vote", playerId: player.id, ballot: "ablehnen" });
      }
      break;
    case "legislative_president":
      for (const card of state.presidentHand) {
        actions.push({ type: "discard", playerId: pres.id, policyId: card.id });
      }
      break;
    case "legislative_chancellor": {
      const chancellor = state.chancellorIndex === null ? undefined : state.players[state.chancellorIndex];
      if (!chancellor) break;
      for (const card of state.chancellorHand) {
        actions.push({ type: "enact", playerId: chancellor.id, policyId: card.id });
      }
      if (state.vetoUnlocked && !state.vetoDenied) {
        actions.push({ type: "request_veto", playerId: chancellor.id });
      }
      break;
    }
    case "veto_request":
      actions.push({ type: "resolve_veto", playerId: pres.id, accept: true });
      actions.push({ type: "resolve_veto", playerId: pres.id, accept: false });
      break;
    case "executive": {
      const targets = otherLivingIds(state, state.presidentIndex);
      if (state.pendingPower === "tagesordnung") {
        actions.push({ type: "ack_peek", playerId: pres.id });
      } else if (state.pendingPower === "kassenpruefung") {
        for (const id of targets) actions.push({ type: "investigate", playerId: pres.id, targetId: id });
      } else if (state.pendingPower === "sondersitzung") {
        for (const id of targets) actions.push({ type: "special_election", playerId: pres.id, targetId: id });
      } else if (state.pendingPower === "nicht_entlastung") {
        for (const id of targets) actions.push({ type: "exclude", playerId: pres.id, targetId: id });
      }
      break;
    }
    default:
      break;
  }
  return actions;
}

/** Nur für Tests und Server-interne Kontrolle. Niemals an Clients senden. */
export function boardFor(playerCount: number): ExecutivePower[] {
  return boardPowers(playerCount);
}

export function isClientAction(value: unknown): value is ClientAction {
  if (!value || typeof value !== "object") return false;
  const action = value as { type?: unknown };
  switch (action.type) {
    case "ack_briefing":
    case "request_veto":
    case "ack_peek":
      return true;
    case "nominate":
      return typeof (value as { chancellorId?: unknown }).chancellorId === "string";
    case "vote": {
      const ballot = (value as { ballot?: unknown }).ballot;
      return ballot === "zustimmen" || ballot === "ablehnen";
    }
    case "discard":
    case "enact":
      return typeof (value as { policyId?: unknown }).policyId === "string";
    case "resolve_veto":
      return typeof (value as { accept?: unknown }).accept === "boolean";
    case "investigate":
    case "special_election":
    case "exclude":
      return typeof (value as { targetId?: unknown }).targetId === "string";
    default:
      return false;
  }
}
