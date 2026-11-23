import { roleTitle, winCopy } from "./copy";
import type { GameState } from "./types";

export interface ProtokollPerson {
  name: string;
  role: GameState["players"][number]["role"];
  roleTitle: string;
  alive: boolean;
  npc: boolean;
}

export interface ProtokollAntrag {
  title: string;
  flavor: string;
  chaos: boolean;
}

/** Öffentliche Übersicht nach Sitzungsende. Keine verdeckten Karten, keine Stimmen. */
export interface Sitzungsprotokoll {
  id: string;
  code: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  winner: NonNullable<GameState["winner"]>;
  winTitle: string;
  winBody: string;
  winStamp: string;
  players: ProtokollPerson[];
  vereinswohl: ProtokollAntrag[];
  eigeninteresse: ProtokollAntrag[];
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} Std. ${minutes} Min.`;
  if (minutes > 0) return `${minutes} Min. ${seconds} Sek.`;
  return `${seconds} Sek.`;
}

export function buildSitzungsprotokoll(
  state: GameState,
  meta: { id: string; code: string; startedAt: number; endedAt: number },
): Sitzungsprotokoll | null {
  if (state.phase !== "game_over" || !state.winner || !state.winReason) return null;
  const win = winCopy(state.winReason);
  const endedAt = Math.max(meta.endedAt, meta.startedAt);
  return {
    id: meta.id,
    code: meta.code,
    startedAt: meta.startedAt,
    endedAt,
    durationMs: endedAt - meta.startedAt,
    winner: state.winner,
    winTitle: win.title,
    winBody: win.body,
    winStamp: win.stamp,
    players: state.players.map((player) => ({
      name: player.name,
      role: player.role,
      roleTitle: roleTitle(player.role),
      alive: player.alive,
      npc: player.npc,
    })),
    vereinswohl: state.enactedVereinswohl.map((card) => ({
      title: card.title,
      flavor: card.flavor,
      chaos: card.chaos,
    })),
    eigeninteresse: state.enactedEigeninteresse.map((card) => ({
      title: card.title,
      flavor: card.flavor,
      chaos: card.chaos,
    })),
  };
}
