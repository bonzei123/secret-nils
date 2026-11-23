import type { PlayerView } from "./view";
import { TIMER_CHOICES, type TimerChoice } from "./copy";
import type { ClientAction } from "./types";

export interface LobbyPlayerWire {
  id: string;
  name: string;
  seat: number;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  isYou: boolean;
}

export interface LobbyWire {
  code: string;
  status: "lobby" | "playing";
  youId: string;
  hostId: string;
  players: LobbyPlayerWire[];
  options: {
    turnTimerSeconds: TimerChoice;
    sitzeMischen: boolean;
    probeMitNpcs: boolean;
  };
  /** Namen der Platzhalter, die beim Start auf fünf Sitze auffüllen. */
  npcFillers: string[];
  canStart: boolean;
  blockReason: string | null;
  timerChoices: readonly number[];
}

export interface LiveGameView extends PlayerView {
  turnSecondsLeft: number | null;
  turnSecondsTotal: number;
}

export interface ClientState {
  lobby: LobbyWire;
  game: LiveGameView | null;
}

export interface Ack {
  ok: boolean;
  error?: string;
  token?: string;
  code?: string;
  playerId?: string;
}

export interface CreatePayload {
  name?: unknown;
  turnTimerSeconds?: unknown;
  sitzeMischen?: unknown;
}

export interface JoinPayload {
  code?: unknown;
  name?: unknown;
}

export interface ReadyPayload {
  ready?: unknown;
}

export interface KickPayload {
  playerId?: unknown;
}

export interface OptionsPayload {
  turnTimerSeconds?: unknown;
  sitzeMischen?: unknown;
  probeMitNpcs?: unknown;
}

export interface ReconnectPayload {
  token?: unknown;
}

export type { ClientAction, TimerChoice };
export { TIMER_CHOICES };
