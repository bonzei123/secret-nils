import type { ExecutivePower, Faction, Role } from "./types";

export interface RoleCounts {
  ehrlich: number;
  linientreu: number;
  nils: number;
}

/** Offizielle Verteilung für 5–10 Spieler. */
export function roleCounts(playerCount: number): RoleCounts {
  switch (playerCount) {
    case 5:
      return { ehrlich: 3, linientreu: 1, nils: 1 };
    case 6:
      return { ehrlich: 4, linientreu: 1, nils: 1 };
    case 7:
      return { ehrlich: 4, linientreu: 2, nils: 1 };
    case 8:
      return { ehrlich: 5, linientreu: 2, nils: 1 };
    case 9:
      return { ehrlich: 5, linientreu: 3, nils: 1 };
    case 10:
      return { ehrlich: 6, linientreu: 3, nils: 1 };
    default:
      throw new Error("Secret Nils wird mit 5 bis 10 Mitgliedern gespielt.");
  }
}

export function roleBag(playerCount: number): Role[] {
  const counts = roleCounts(playerCount);
  return [
    ...Array.from({ length: counts.ehrlich }, () => "ehrliches_mitglied" as const),
    ...Array.from({ length: counts.linientreu }, () => "linientreuer" as const),
    "nils",
  ];
}

/**
 * In kleinen Runden (5–6) kennt Nils die linientreuen Festangestellten.
 * Ab 7 kennt er sie nicht — sie kennen ihn weiterhin.
 */
export function nilsKnowsStaff(playerCount: number): boolean {
  return playerCount <= 6;
}

export function factionOf(role: Role): Faction {
  return role === "ehrliches_mitglied" ? "verein" : "kluengel";
}

/**
 * Sonderaktionen auf dem Eigeninteresse-Track (Felder 1–5).
 * Feld 6 ist der Sieg und hat keine Aktion.
 * Notverwaltung löst nie eine Sonderaktion aus.
 */
export function boardPowers(playerCount: number): ExecutivePower[] {
  if (playerCount <= 6) {
    return ["none", "none", "tagesordnung", "nicht_entlastung", "nicht_entlastung"];
  }
  if (playerCount <= 8) {
    return ["none", "kassenpruefung", "sondersitzung", "nicht_entlastung", "nicht_entlastung"];
  }
  return ["kassenpruefung", "kassenpruefung", "sondersitzung", "nicht_entlastung", "nicht_entlastung"];
}

export function powerOnSlot(playerCount: number, slot: number): ExecutivePower {
  if (slot < 1 || slot > 5) return "none";
  return boardPowers(playerCount)[slot - 1] ?? "none";
}

export function compositionSentence(playerCount: number): string {
  const c = roleCounts(playerCount);
  const ehrlich =
    c.ehrlich === 1 ? "1 ehrliches Mitglied" : `${c.ehrlich} ehrliche Mitglieder`;
  const staff =
    c.linientreu === 1
      ? "1 linientreuer Festangestellter"
      : `${c.linientreu} linientreue Festangestellte`;
  return `${playerCount} Mitglieder: ${ehrlich}, ${staff}, 1 Nils.`;
}
