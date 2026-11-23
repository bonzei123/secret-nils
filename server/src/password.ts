import { timingSafeEqual } from "node:crypto";

/** Ohne hinterlegtes Wort ist die Werkstatt offen. Sonst muss das Wort exakt stimmen. */
export function passesPolicyPassword(expected: string | undefined, given: unknown): boolean {
  if (!expected) return true;
  const provided = typeof given === "string" ? given : "";
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) {
    timingSafeEqual(left, Buffer.alloc(left.length));
    return false;
  }
  return timingSafeEqual(left, right);
}
