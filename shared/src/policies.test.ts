import { describe, expect, it } from "vitest";
import { CATALOG } from "./deck";
import { deckFrom, presentPolicies, savePolicies, type StoredPolicies } from "./policies";

const empty: StoredPolicies = { edits: {}, custom: [] };
let seq = 0;
const ids = () => {
  seq += 1;
  return `custom-test${seq}`;
};

function allCards() {
  return presentPolicies(empty).map((card) => ({
    id: card.id,
    type: card.type,
    title: card.title,
    flavor: card.flavor,
    builtin: card.builtin,
  }));
}

describe("Beschlussvorlagen", () => {
  it("schreibt eine Satzungsvorlage um und setzt sie zurück, wenn der Originaltext wieder da ist", () => {
    const cards = allCards();
    const first = cards[0]!;
    first.title = "Kassenbuch am Schwarzen Brett";
    first.flavor = "Jede Quittung hängt eine Woche lang aus.";
    const saved = savePolicies(empty, { cards }, ids);
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.stored.edits[first.id]).toEqual({
      title: "Kassenbuch am Schwarzen Brett",
      flavor: "Jede Quittung hängt eine Woche lang aus.",
    });
    expect(deckFrom(saved.stored)[0]?.title).toBe("Kassenbuch am Schwarzen Brett");

    first.title = CATALOG[0]!.title;
    first.flavor = CATALOG[0]!.flavor;
    const reset = savePolicies(saved.stored, { cards }, ids);
    if (!reset.ok) throw new Error(reset.error);
    expect(reset.stored.edits[first.id]).toBeUndefined();
  });

  it("nimmt eigene Vorlagen auf und vergisst sie, wenn sie nicht mehr mitgeschickt werden", () => {
    const cards = [
      ...allCards(),
      { id: "neu-1", type: "eigeninteresse", title: "Spesen für den Vereinsausflug nach Palma", flavor: "Teambuilding. Nur der Vorstand.", builtin: false },
    ];
    const saved = savePolicies(empty, { cards }, ids);
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.stored.custom).toHaveLength(1);
    expect(deckFrom(saved.stored).some((card) => card.title.startsWith("Spesen"))).toBe(true);

    const dropped = savePolicies(saved.stored, { cards: allCards() }, ids);
    if (!dropped.ok) throw new Error(dropped.error);
    expect(dropped.stored.custom).toEqual([]);
  });

  it("lässt Satzungsvorlagen nicht streichen und lehnt zu kurze Titel ab", () => {
    const cards = allCards().slice(1);
    expect(savePolicies(empty, { cards }, ids).ok).toBe(false);
    const broken = allCards();
    broken[0]!.title = "Nö";
    const rejected = savePolicies(empty, { cards: broken }, ids);
    expect(rejected.ok).toBe(false);
  });

  it("setzt auf Wunsch die ganze Satzung zurück", () => {
    const saved = savePolicies(empty, { reset: true }, ids);
    expect(saved.ok).toBe(true);
  });
});
