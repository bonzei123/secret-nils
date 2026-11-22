import type { RngState } from "./types";

/** Deterministischer Generator (mulberry32). Gleicher Seed, gleiche Sitzung. */
export function nextRng(state: RngState): { value: number; state: RngState } {
  let t = (state.seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const next = t >>> 0;
  const value = (next ^ (next >>> 14)) >>> 0;
  return { value: value / 4294967296, state: { seed: next } };
}

export function shuffle<T>(items: readonly T[], rng: RngState): { result: T[]; rng: RngState } {
  const result = items.slice();
  let state = rng;
  for (let i = result.length - 1; i > 0; i -= 1) {
    const roll = nextRng(state);
    state = roll.state;
    const j = Math.floor(roll.value * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a === undefined || b === undefined) continue;
    result[i] = b;
    result[j] = a;
  }
  return { result, rng: state };
}

export function pickIndex(length: number, rng: RngState): { index: number; rng: RngState } {
  if (length <= 0) throw new Error("Nichts zum Ziehen.");
  const roll = nextRng(rng);
  return { index: Math.floor(roll.value * length), rng: roll.state };
}
