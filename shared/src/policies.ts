import { CATALOG } from "./deck";
import type { PolicyCard, PolicyType } from "./types";

const BIDI = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

export const POLICY_TITLE_MIN = 3;
export const POLICY_TITLE_MAX = 80;
export const POLICY_FLAVOR_MAX = 280;
export const POLICY_CUSTOM_MAX = 40;

export interface PolicyEditorCard {
  id: string;
  type: PolicyType;
  title: string;
  flavor: string;
  builtin: boolean;
  originalTitle: string | null;
  originalFlavor: string | null;
}

export interface StoredPolicies {
  edits: Record<string, { title: string; flavor: string }>;
  custom: PolicyCard[];
}

export const EMPTY_POLICIES: StoredPolicies = { edits: {}, custom: [] };

const BUILTIN = new Map(CATALOG.map((card) => [card.id, card]));

export function presentPolicies(stored: StoredPolicies): PolicyEditorCard[] {
  const builtins = CATALOG.map((card) => {
    const edit = stored.edits[card.id];
    return {
      id: card.id,
      type: card.type,
      title: edit?.title ?? card.title,
      flavor: edit?.flavor ?? card.flavor,
      builtin: true,
      originalTitle: card.title,
      originalFlavor: card.flavor,
    };
  });
  const custom = stored.custom.map((card) => ({
    id: card.id,
    type: card.type,
    title: card.title,
    flavor: card.flavor,
    builtin: false,
    originalTitle: null,
    originalFlavor: null,
  }));
  return [...builtins, ...custom];
}

export function deckFrom(stored: StoredPolicies): PolicyCard[] {
  return presentPolicies(stored).map((card) => ({
    id: card.id,
    type: card.type,
    title: card.title,
    flavor: card.flavor,
  }));
}

export function savePolicies(
  current: StoredPolicies,
  body: unknown,
  createId: () => string,
): { ok: true; stored: StoredPolicies } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Die Vorlagen sind so nicht lesbar." };
  const record = body as { reset?: unknown; cards?: unknown };
  if (record.reset === true) return { ok: true, stored: { edits: {}, custom: [] } };

  if (!Array.isArray(record.cards)) return { ok: false, error: "Die Vorlagenliste fehlt." };
  const seen = new Set<string>();
  const edits: StoredPolicies["edits"] = {};
  const custom: PolicyCard[] = [];
  const knownCustom = new Set(current.custom.map((card) => card.id));

  for (const entry of record.cards) {
    if (!entry || typeof entry !== "object") return { ok: false, error: "Eine Vorlage ist unlesbar." };
    const card = entry as { id?: unknown; type?: unknown; title?: unknown; flavor?: unknown; builtin?: unknown };
    const title = cleanText(card.title, POLICY_TITLE_MIN, POLICY_TITLE_MAX);
    if (!title) return { ok: false, error: `Jeder Titel braucht ${POLICY_TITLE_MIN} bis ${POLICY_TITLE_MAX} Zeichen.` };
    const flavor = cleanText(card.flavor, 0, POLICY_FLAVOR_MAX);
    if (flavor === null) return { ok: false, error: `Der Beitext darf höchstens ${POLICY_FLAVOR_MAX} Zeichen haben.` };

    const builtin = card.builtin === true || (typeof card.id === "string" && BUILTIN.has(card.id) && card.builtin !== false);
    if (builtin) {
      if (typeof card.id !== "string" || !BUILTIN.has(card.id)) {
        return { ok: false, error: "Eine Satzungsvorlage ist unbekannt." };
      }
      if (seen.has(card.id)) return { ok: false, error: "Eine Vorlage kommt doppelt vor." };
      seen.add(card.id);
      const original = BUILTIN.get(card.id)!;
      if (title !== original.title || flavor !== original.flavor) edits[card.id] = { title, flavor };
      continue;
    }

    if (!isType(card.type)) return { ok: false, error: "Jede eigene Vorlage braucht ein Lager: Vereinswohl oder Eigeninteresse." };
    if (custom.length >= POLICY_CUSTOM_MAX) {
      return { ok: false, error: `Höchstens ${POLICY_CUSTOM_MAX} eigene Vorlagen.` };
    }
    const id = typeof card.id === "string" && knownCustom.has(card.id) ? card.id : createId();
    if (seen.has(id) || BUILTIN.has(id)) return { ok: false, error: "Eine eigene Vorlage hat eine Kennung, die schon vergeben ist." };
    seen.add(id);
    custom.push({ id, type: card.type, title, flavor });
  }

  for (const card of CATALOG) {
    if (!seen.has(card.id)) return { ok: false, error: "Satzungsvorlagen kann man umschreiben, aber nicht streichen." };
  }
  return { ok: true, stored: { edits, custom } };
}

function isType(value: unknown): value is PolicyType {
  return value === "vereinswohl" || value === "eigeninteresse";
}

function cleanText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(BIDI, "").replace(/\s+/g, " ").trim();
  if (cleaned.length < min || cleaned.length > max) return null;
  return cleaned;
}
