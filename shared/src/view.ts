import { powerHint, powerLabel, roleBrief, roleTitle, winCopy } from "./copy";
import { eligibleChancellorIds, livingCount } from "./engine";
import { boardPowers, factionOf, nilsKnowsStaff } from "./roles";
import { phaseLabel } from "./copy";
import type {
  Ballot,
  EnactedPolicy,
  ExecutivePower,
  GameState,
  Phase,
  Player,
  PolicyCard,
  Role,
  WinReason,
} from "./types";

export interface AllyView {
  id: string;
  name: string;
  role: "linientreuer" | "nils";
}

export interface PublicPlayerView {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  connected: boolean;
  isYou: boolean;
  isPresident: boolean;
  isChancellor: boolean;
  isNominee: boolean;
  termLimited: boolean;
  voted: boolean;
  ballot: Ballot | null;
  npc: boolean;
}

export interface PolicyView {
  id: string;
  type: PolicyCard["type"];
  title: string;
  flavor: string;
}

export interface EnactedView {
  id: string;
  title: string;
  chaos: boolean;
  power: ExecutivePower | null;
}

export interface PlayerView {
  you: {
    id: string;
    name: string;
    role: Role;
    roleTitle: string;
    brief: string;
    alive: boolean;
    acknowledged: boolean;
  };
  allies: AllyView[];
  nilsSeesStaff: boolean;
  players: PublicPlayerView[];
  phase: Phase;
  phaseLabel: string;
  youMustAct: boolean;
  instruction: string;
  electionTracker: number;
  vetoUnlocked: boolean;
  board: { power: ExecutivePower; label: string }[];
  vereinswohl: EnactedView[];
  eigeninteresse: EnactedView[];
  vereinswohlGoal: number;
  eigeninteresseGoal: number;
  drawCount: number;
  discardCount: number;
  hand: PolicyView[] | null;
  handPurpose: "verwerfen" | "beschliessen" | "gesehen" | null;
  canRequestVeto: boolean;
  pendingPower: ExecutivePower | null;
  pendingPowerLabel: string | null;
  pendingPowerHint: string | null;
  peek: PolicyView[] | null;
  notes: { id: number; kind: "kassenpruefung" | "tagesordnung"; text: string }[];
  eligibleChancellorIds: string[];
  executiveTargetIds: string[];
  lastElection: GameState["lastElection"];
  briefing: { ready: number; total: number } | null;
  specialElectionNote: string | null;
  offices: {
    presidentName: string;
    chancellorName: string | null;
    nomineeName: string | null;
    blockedChancellorName: string | null;
    blockedPresidentName: string | null;
  };
  winner: GameState["winner"];
  winReason: WinReason | null;
  winTitle: string | null;
  winBody: string | null;
  winStamp: string | null;
  revealed: { id: string; name: string; role: Role; roleTitle: string; alive: boolean }[] | null;
  log: GameState["log"];
  composition: string;
  livingCount: number;
}

function copyCard(card: PolicyCard): PolicyView {
  return { id: card.id, type: card.type, title: card.title, flavor: card.flavor };
}

function copyEnacted(card: EnactedPolicy): EnactedView {
  return { id: card.id, title: card.title, chaos: card.chaos, power: card.power };
}

function alliesFor(state: GameState, player: Player): AllyView[] {
  if (player.role === "ehrliches_mitglied") return [];
  if (player.role === "linientreuer") {
    return state.players
      .filter((other) => other.id !== player.id && other.role !== "ehrliches_mitglied")
      .map((other) => ({
        id: other.id,
        name: other.name,
        role: other.role === "nils" ? "nils" : "linientreuer",
      }));
  }
  if (nilsKnowsStaff(state.boardSize)) {
    return state.players
      .filter((other) => other.role === "linientreuer")
      .map((other) => ({ id: other.id, name: other.name, role: "linientreuer" as const }));
  }
  return [];
}

function nextLivingName(state: GameState, fromIndex: number): string {
  const total = state.players.length;
  for (let step = 1; step <= total; step += 1) {
    const player = state.players[(fromIndex + step) % total];
    if (player?.alive) return player.name;
  }
  return "der Reihe";
}

function nameAt(state: GameState, index: number | null): string | null {
  if (index === null) return null;
  return state.players[index]?.name ?? null;
}

export function projectView(
  state: GameState,
  viewerId: string,
  connected: Record<string, boolean> = {},
): PlayerView {
  const viewer = state.players.find((player) => player.id === viewerId);
  if (!viewer) throw new Error("Unbekannte Sitzung.");

  const isPresident = state.presidentIndex === state.players.indexOf(viewer);
  const isChancellor = state.chancellorIndex !== null && state.players[state.chancellorIndex]?.id === viewer.id;
  const knowsStaff = nilsKnowsStaff(state.boardSize);
  const powers = boardPowers(state.boardSize);

  let hand: PolicyView[] | null = null;
  let handPurpose: PlayerView["handPurpose"] = null;
  if (state.phase === "legislative_president" && isPresident) {
    hand = state.presidentHand.map(copyCard);
    handPurpose = "verwerfen";
  } else if (
    (state.phase === "legislative_chancellor" || state.phase === "veto_request") &&
    (isPresident || isChancellor)
  ) {
    hand = state.chancellorHand.map(copyCard);
    handPurpose = isChancellor && state.phase === "legislative_chancellor" ? "beschliessen" : "gesehen";
  }

  const peek =
    isPresident && state.phase === "executive" && state.pendingPower === "tagesordnung"
      ? (state.pendingPeek ?? []).map(copyCard)
      : null;

  const executiveTargetIds =
    isPresident &&
    state.phase === "executive" &&
    (state.pendingPower === "kassenpruefung" ||
      state.pendingPower === "sondersitzung" ||
      state.pendingPower === "nicht_entlastung")
      ? state.players.filter((player) => player.alive && player.id !== viewer.id).map((player) => player.id)
      : [];

  const youMustAct = mustAct(state, viewer, isPresident, isChancellor);
  const aliveLimited = (index: number | null) => {
    if (index === null) return false;
    return Boolean(state.players[index]?.alive);
  };

  const players: PublicPlayerView[] = state.players.map((player, index) => {
    const ballot =
      state.phase === "voting"
        ? null
        : (state.lastBallots?.find((entry) => entry.playerId === player.id)?.ballot ?? null);
    const termLimited =
      (aliveLimited(state.previousChancellorIndex) && state.previousChancellorIndex === index) ||
      (livingCount(state) >= 5 &&
        aliveLimited(state.previousPresidentIndex) &&
        state.previousPresidentIndex === index);
    return {
      id: player.id,
      name: player.name,
      seat: player.seat,
      alive: player.alive,
      connected: viewerId in connected || Object.keys(connected).length > 0 ? Boolean(connected[player.id]) : true,
      isYou: player.id === viewer.id,
      isPresident: index === state.presidentIndex,
      isChancellor: index === state.chancellorIndex,
      isNominee: state.phase === "voting" && index === state.nominatedChancellorIndex,
      termLimited,
      voted: state.phase === "voting" && Boolean(state.votes[player.id]),
      ballot,
      npc: player.npc,
    };
  });

  // Verbindung: leeres Objekt heißt „unbekannt, als verbunden anzeigen“.
  if (Object.keys(connected).length === 0) {
    for (const player of players) player.connected = true;
  }

  const ready = state.players.filter((player) => player.alive && state.briefingAck[player.id]).length;
  const win = state.winReason ? winCopy(state.winReason) : null;

  return {
    you: {
      id: viewer.id,
      name: viewer.name,
      role: viewer.role,
      roleTitle: roleTitle(viewer.role),
      brief: roleBrief(viewer.role, viewer.role === "nils" ? knowsStaff : true),
      alive: viewer.alive,
      acknowledged: Boolean(state.briefingAck[viewer.id]),
    },
    allies: alliesFor(state, viewer),
    nilsSeesStaff: knowsStaff,
    players,
    phase: state.phase,
    phaseLabel: phaseLabel(state.phase),
    youMustAct,
    instruction: instructionFor(state, viewer, isPresident, isChancellor, youMustAct),
    electionTracker: state.electionTracker,
    vetoUnlocked: state.vetoUnlocked,
    board: powers.map((power) => ({ power, label: power === "none" ? "—" : powerLabel(power) })),
    vereinswohl: state.enactedVereinswohl.map(copyEnacted),
    eigeninteresse: state.enactedEigeninteresse.map(copyEnacted),
    vereinswohlGoal: 5,
    eigeninteresseGoal: 6,
    drawCount: state.drawPile.length,
    discardCount: state.discardPile.length,
    hand,
    handPurpose,
    canRequestVeto:
      isChancellor && state.phase === "legislative_chancellor" && state.vetoUnlocked && !state.vetoDenied,
    pendingPower: state.phase === "executive" ? state.pendingPower : null,
    pendingPowerLabel: state.phase === "executive" && state.pendingPower ? powerLabel(state.pendingPower) : null,
    pendingPowerHint: state.phase === "executive" && state.pendingPower ? powerHint(state.pendingPower) : null,
    peek,
    notes: (state.privateNotes[viewer.id] ?? []).map((note) => ({ ...note })),
    eligibleChancellorIds: state.phase === "nominating" ? eligibleChancellorIds(state) : [],
    executiveTargetIds,
    lastElection: state.lastElection ? { ...state.lastElection } : null,
    briefing:
      state.phase === "briefing"
        ? { ready, total: state.players.filter((player) => player.alive).length }
        : null,
    specialElectionNote:
      state.specialElectionCallerIndex === null
        ? null
        : `Sondersitzung, einberufen von ${nameAt(state, state.specialElectionCallerIndex)}. Danach übernimmt ${nextLivingName(state, state.specialElectionCallerIndex)} den Vorsitz.`,
    offices: {
      presidentName: nameAt(state, state.presidentIndex) ?? "—",
      chancellorName: nameAt(state, state.chancellorIndex),
      nomineeName: state.phase === "voting" ? nameAt(state, state.nominatedChancellorIndex) : null,
      blockedChancellorName: aliveLimited(state.previousChancellorIndex)
        ? nameAt(state, state.previousChancellorIndex)
        : null,
      blockedPresidentName:
        livingCount(state) >= 5 && aliveLimited(state.previousPresidentIndex)
          ? nameAt(state, state.previousPresidentIndex)
          : null,
    },
    winner: state.winner,
    winReason: state.winReason,
    winTitle: win?.title ?? null,
    winBody: win?.body ?? null,
    winStamp: win?.stamp ?? null,
    revealed:
      state.phase === "game_over"
        ? state.players.map((player) => ({
            id: player.id,
            name: player.name,
            role: player.role,
            roleTitle: roleTitle(player.role),
            alive: player.alive,
          }))
        : null,
    log: state.log.map((entry) => ({ ...entry })),
    composition: `${state.boardSize} Mitglieder am Tisch. Lager: ${countRoles(state)}.`,
    livingCount: livingCount(state),
  };
}

function countRoles(state: GameState): string {
  const ehrlich = state.players.filter((player) => player.role === "ehrliches_mitglied").length;
  const staff = state.players.filter((player) => player.role === "linientreuer").length;
  return `${ehrlich} ehrlich, ${staff} linientreu, 1 Nils`;
}

function mustAct(state: GameState, viewer: Player, isPresident: boolean, isChancellor: boolean): boolean {
  if (!viewer.alive || state.phase === "game_over") return false;
  switch (state.phase) {
    case "briefing":
      return !state.briefingAck[viewer.id];
    case "nominating":
      return isPresident;
    case "voting":
      return !state.votes[viewer.id];
    case "legislative_president":
      return isPresident;
    case "legislative_chancellor":
      return isChancellor;
    case "veto_request":
      return isPresident;
    case "executive":
      return isPresident;
    default:
      return false;
  }
}

function instructionFor(
  state: GameState,
  viewer: Player,
  isPresident: boolean,
  isChancellor: boolean,
  youMustAct: boolean,
): string {
  if (!viewer.alive && state.phase !== "game_over") {
    return "Du bist ausgeschlossen und schaust nur noch zu. Nicht abstimmen, nicht kandidieren.";
  }
  const chair = state.players[state.presidentIndex]?.name ?? "der Vorsitz";
  const purse =
    (state.chancellorIndex !== null ? state.players[state.chancellorIndex]?.name : null) ??
    (state.nominatedChancellorIndex !== null ? state.players[state.nominatedChancellorIndex]?.name : null) ??
    "die Kasse";

  switch (state.phase) {
    case "briefing":
      return youMustAct
        ? "Decke deinen Ausweis auf. Nur du siehst ihn. Danach im Protokoll abhaken."
        : "Warte, bis alle ihren Ausweis gelesen haben.";
    case "nominating":
      return youMustAct
        ? "Schlage ein wählbares Mitglied als Kassenwart vor."
        : `${chair} schlägt den nächsten Kassenwart vor.`;
    case "voting":
      return youMustAct
        ? `${chair} schlägt ${purse} als Kassenwart vor. Zustimmen oder ablehnen — geheim, bis alle gelegt haben.`
        : "Deine Stimmkarte liegt. Warte auf den Rest der Versammlung.";
    case "legislative_president":
      return youMustAct
        ? "Drei Vorlagen. Eine in den Reißwolf, zwei gehen an die Kasse."
        : `${chair} sortiert drei Vorlagen. Der Inhalt bleibt verdeckt.`;
    case "legislative_chancellor":
      if (youMustAct) {
        return state.vetoUnlocked
          ? "Setze eine der zwei Vorlagen um — oder rüge beide als Formfehler, wenn der Vorsitz mitzieht."
          : "Setze eine der zwei Vorlagen um. Die andere wandert in den Reißwolf.";
      }
      return `${purse} entscheidet, welche Vorlage Beschluss wird.`;
    case "veto_request":
      return youMustAct
        ? `${purse} rügt beide Vorlagen als satzungswidrig. Stimmst du zu, gilt kein Beschluss und der Tracker rückt vor.`
        : `${chair} entscheidet über die Formfehler-Rüge.`;
    case "executive":
      if (!youMustAct) return `${chair} führt die Sonderaktion aus: ${state.pendingPower ? powerLabel(state.pendingPower) : "Sonderaktion"}.`;
      switch (state.pendingPower) {
        case "kassenpruefung":
          return "Prüfe die Vereinsakte eines anderen Mitglieds. Du erfährst nur: ehrlich oder Klüngel.";
        case "sondersitzung":
          return "Bestimme, wer sofort einmalig den 1. Vorsitz übernimmt.";
        case "tagesordnung":
          return "Lies die drei obersten Vorlagen. Sie bleiben auf dem Stapel. Danach die Mappe schließen.";
        case "nicht_entlastung":
          return "Stelle den Antrag auf Nicht-Entlastung. Die Person scheidet sofort aus. Ist es Nils, gewinnt der Verein.";
        default:
          return "Führe die Sonderaktion aus.";
      }
    case "game_over":
      return state.winner === "verein"
        ? "Die ehrlichen Mitglieder haben die Sitzung gewonnen."
        : "Der Klüngel hat die Sitzung gewonnen.";
    default:
      return "";
  }
}

export function factionLabel(role: Role): string {
  return factionOf(role) === "verein" ? "Verein" : "Klüngel";
}
