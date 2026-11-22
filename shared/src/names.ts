const BIDI = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Anzeigename fürs Protokoll. Leer oder zu lang ergibt null. */
export function sanitizeName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(BIDI, "").replace(/\s+/g, " ").trim();
  if (cleaned.length < 2 || cleaned.length > 20) return null;
  return cleaned;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (code.length !== 4) return null;
  if ([...code].some((char) => !CODE_ALPHABET.includes(char))) return null;
  return code;
}

export { CODE_ALPHABET };
