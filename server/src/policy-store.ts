import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  deckFrom,
  EMPTY_POLICIES,
  presentPolicies,
  savePolicies,
  type PolicyEditorCard,
  type StoredPolicies,
} from "@secret-nils/shared";
import type { PolicyCard } from "@secret-nils/shared";

export class PolicyStore {
  private stored: StoredPolicies = { edits: {}, custom: [] };

  constructor(private readonly filePath: string) {
    this.stored = this.read();
  }

  view(): { cards: PolicyEditorCard[] } {
    return { cards: presentPolicies(this.stored) };
  }

  deck(): PolicyCard[] {
    return deckFrom(this.stored);
  }

  save(body: unknown): { ok: true; cards: PolicyEditorCard[] } | { ok: false; error: string } {
    const result = savePolicies(this.stored, body, () => this.nextId());
    if (!result.ok) return result;
    try {
      this.write(result.stored);
    } catch {
      return { ok: false, error: "Die Vorlagen konnten nicht gespeichert werden. Der Ordner für die Satzung ist nicht beschreibbar." };
    }
    this.stored = result.stored;
    return { ok: true, cards: presentPolicies(this.stored) };
  }

  private nextId(): string {
    return `custom-${randomBytes(6).toString("hex")}`;
  }

  private read(): StoredPolicies {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as StoredPolicies;
      if (!parsed || typeof parsed !== "object" || !parsed.edits || !Array.isArray(parsed.custom)) return { ...EMPTY_POLICIES };
      return { edits: parsed.edits, custom: parsed.custom };
    } catch {
      return { edits: {}, custom: [] };
    }
  }

  private write(stored: StoredPolicies): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  }
}
