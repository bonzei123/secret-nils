export type Role = "ehrliches_mitglied" | "linientreuer" | "nils";

/** Öffentliche Lagerzugehörigkeit. Nils gilt bei der Kassenprüfung als Klüngel. */
export type Faction = "verein" | "kluengel";

export type PolicyType = "vereinswohl" | "eigeninteresse";

export type Ballot = "zustimmen" | "ablehnen";

export type Phase =
  | "briefing"
  | "nominating"
  | "voting"
  | "legislative_president"
  | "legislative_chancellor"
  | "veto_request"
  | "executive"
  | "game_over";

export type ExecutivePower =
  | "none"
  | "kassenpruefung"
  | "sondersitzung"
  | "tagesordnung"
  | "nicht_entlastung";

export type WinReason =
  | "vereinswohl_track"
  | "nils_ausgeschlossen"
  | "eigeninteresse_track"
  | "nils_kassenwart";

export interface PolicyCard {
  id: string;
  type: PolicyType;
  title: string;
  flavor: string;
}

export interface EnactedPolicy extends PolicyCard {
  chaos: boolean;
  /** Sonderaktion, die dieser Beschluss ausgelöst hat. Bei Notverwaltung immer null. */
  power: ExecutivePower | null;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  role: Role;
  alive: boolean;
}

export interface SecretNote {
  id: number;
  kind: "kassenpruefung" | "tagesordnung";
  text: string;
}

export interface GameEvent {
  id: number;
  text: string;
  tone: "info" | "good" | "bad" | "warn";
}

export interface RngState {
  seed: number;
}

export interface BallotRecord {
  playerId: string;
  ballot: Ballot;
}

export interface ElectionTally {
  ja: number;
  nein: number;
  passed: boolean;
}

export interface GameState {
  boardSize: number;
  players: Player[];
  rng: RngState;
  drawPile: PolicyCard[];
  discardPile: PolicyCard[];
  enactedVereinswohl: EnactedPolicy[];
  enactedEigeninteresse: EnactedPolicy[];
  phase: Phase;
  presidentIndex: number;
  chancellorIndex: number | null;
  nominatedChancellorIndex: number | null;
  /** Letzte Regierung, die tatsächlich gewählt wurde (auch wenn sie später ein Veto einlegte). */
  previousPresidentIndex: number | null;
  previousChancellorIndex: number | null;
  electionTracker: number;
  /** Sitz des Vorsitzes, der die laufende Sondersitzung einberufen hat. */
  specialElectionCallerIndex: number | null;
  vetoUnlocked: boolean;
  vetoDenied: boolean;
  votes: Record<string, Ballot>;
  lastBallots: BallotRecord[] | null;
  lastElection: ElectionTally | null;
  presidentHand: PolicyCard[];
  chancellorHand: PolicyCard[];
  pendingPower: ExecutivePower | null;
  pendingPeek: PolicyCard[] | null;
  briefingAck: Record<string, boolean>;
  privateNotes: Record<string, SecretNote[]>;
  noteSeq: number;
  winner: Faction | null;
  winReason: WinReason | null;
  log: GameEvent[];
  logSeq: number;
}

export interface CreatePlayerInput {
  id: string;
  name: string;
}

export interface CreateGameOptions {
  seed?: number;
  /** Rollen in Sitzreihenfolge. Nur für Tests; der Server vergibt sie zufällig. */
  roleOrder?: Role[];
  /** Index 0 ist die oberste Karte. Ersetzt den gemischten Stapel. */
  drawPile?: PolicyCard[];
  discardPile?: PolicyCard[];
  firstPresidentIndex?: number;
  /** Sitze vor dem Verteilen der Rollen mischen. Wird ignoriert, wenn roleOrder gesetzt ist. */
  sitzeMischen?: boolean;
}

export type ClientAction =
  | { type: "ack_briefing" }
  | { type: "nominate"; chancellorId: string }
  | { type: "vote"; ballot: Ballot }
  | { type: "discard"; policyId: string }
  | { type: "enact"; policyId: string }
  | { type: "request_veto" }
  | { type: "resolve_veto"; accept: boolean }
  | { type: "investigate"; targetId: string }
  | { type: "special_election"; targetId: string }
  | { type: "ack_peek" }
  | { type: "exclude"; targetId: string };

export type EngineAction = ClientAction & { playerId: string };

export type ApplyResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };
