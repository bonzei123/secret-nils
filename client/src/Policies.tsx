import { useEffect, useState } from "react";
import type { PolicyEditorCard, PolicyType } from "@secret-nils/shared";
import { Leaf, Logo, Wordmark } from "./ui";

interface PoliciesProps {
  onBack: () => void;
}

type Draft = PolicyEditorCard & { key: string };

export function Policies({ onBack }: PoliciesProps) {
  const [cards, setCards] = useState<Draft[] | null>(null);
  const [geschuetzt, setGeschuetzt] = useState(false);
  const [passwort, setPasswort] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void load()
      .then((next) => {
        setCards(next.cards);
        setGeschuetzt(next.geschuetzt);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  async function persist(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const next = await save({ ...body, passwort });
      setCards(next.cards);
      setGeschuetzt(next.geschuetzt);
      setNote(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Speichern hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  function update(key: string, patch: Partial<Draft>) {
    setCards((current) => current?.map((card) => (card.key === key ? { ...card, ...patch } : card)) ?? null);
  }

  function add(type: PolicyType) {
    setCards((current) => [
      ...(current ?? []),
      {
        key: `neu-${Date.now()}`,
        id: "",
        type,
        title: "",
        flavor: "",
        builtin: false,
        originalTitle: null,
        originalFlavor: null,
      },
    ]);
  }

  const verein = cards?.filter((card) => card.type === "vereinswohl") ?? [];
  const eigen = cards?.filter((card) => card.type === "eigeninteresse") ?? [];

  return (
    <main className="center-card policies">
      <header className="masthead">
        <Logo />
        <div>
          <p className="kicker">Satzungswerkstatt</p>
          <h1>
            <Wordmark>Beschlussvorlagen</Wordmark>
          </h1>
        </div>
      </header>
      <p className="lede">
        Die mitgelieferten Anträge kannst du umschreiben. Eigene kommen obendrauf in den Stapel. Eine laufende Sitzung behält ihre Karten, die nächste mischt neu.
      </p>
      {geschuetzt ? (
        <label>
          Satzungspasswort
          <input type="password" autoComplete="current-password" value={passwort} onChange={(event) => setPasswort(event.target.value)} />
        </label>
      ) : (
        <p className="note-warn">Ungeschützt. Jeder, der diese Seite öffnet, kann die Vorlagen ändern. Setze auf dem Server SATZUNG_PASSWORT.</p>
      )}
      {error && <p className="note-warn">{error}</p>}
      {note && <p className="meta-line">{note}</p>}
      {!cards && !error && <p>Die Satzung wird aus dem Schrank geholt.</p>}
      {cards && (
        <>
          <PolicyGroup title="Vereinswohl" tone="good" cards={verein} onChange={update} onAdd={() => add("vereinswohl")} onRemove={(key) => setCards((current) => current?.filter((card) => card.key !== key) ?? null)} />
          <PolicyGroup title="Eigeninteresse" tone="bad" cards={eigen} onChange={update} onAdd={() => add("eigeninteresse")} onRemove={(key) => setCards((current) => current?.filter((card) => card.key !== key) ?? null)} />
          <div className="btn-row" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                void persist(
                  {
                    cards: cards.map((card) => ({
                      id: card.id,
                      type: card.type,
                      title: card.title,
                      flavor: card.flavor,
                      builtin: card.builtin,
                    })),
                  },
                  "Die Vorlagen liegen im Schrank. Die nächste Sitzung mischt sie.",
                )
              }
            >
              Vorlagen speichern
            </button>
            <button type="button" className="btn secondary" disabled={busy} onClick={() => void persist({ reset: true }, "Die Originalsatzung ist wieder da.")}>
              Original wiederherstellen
            </button>
            <button type="button" className="btn ghost" onClick={onBack}>
              Zurück
            </button>
          </div>
        </>
      )}
    </main>
  );
}

function PolicyGroup({
  title,
  tone,
  cards,
  onChange,
  onAdd,
  onRemove,
}: {
  title: string;
  tone: "good" | "bad";
  cards: Draft[];
  onChange: (key: string, patch: Partial<Draft>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <section className="policy-group">
      <div className="track-head">
        <h2>
          <Leaf tone={tone} />
          {title}
        </h2>
        <button type="button" className="btn secondary" onClick={onAdd}>
          Eigene Vorlage
        </button>
      </div>
      <div className="policy-list">
        {cards.map((card) => (
          <article key={card.key} className={`policy-edit antrag ${card.type}`}>
            <div className="badges">
              <Leaf tone={tone} />
              {card.builtin ? <span className="badge">Satzung</span> : <span className="badge warn">Eigene</span>}
              {card.builtin && (card.title !== card.originalTitle || card.flavor !== card.originalFlavor) && <span className="badge good">geändert</span>}
            </div>
            <label>
              Titel
              <input value={card.title} maxLength={80} onChange={(event) => onChange(card.key, { title: event.target.value })} />
            </label>
            <label>
              Beitext
              <textarea value={card.flavor} maxLength={280} rows={3} onChange={(event) => onChange(card.key, { flavor: event.target.value })} />
            </label>
            <div className="btn-row">
              {card.builtin && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => onChange(card.key, { title: card.originalTitle ?? card.title, flavor: card.originalFlavor ?? card.flavor })}
                >
                  Diesen Text zurücksetzen
                </button>
              )}
              {!card.builtin && (
                <button type="button" className="btn danger" onClick={() => onRemove(card.key)}>
                  Entfernen
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

async function load(): Promise<{ cards: Draft[]; geschuetzt: boolean }> {
  const response = await fetch("/api/policies");
  const body = (await response.json()) as { cards?: PolicyEditorCard[]; geschuetzt?: boolean; error?: string };
  if (!response.ok || !body.cards) throw new Error(body.error ?? "Die Vorlagen sind nicht angekommen.");
  return { cards: body.cards.map((card) => ({ ...card, key: card.id })), geschuetzt: body.geschuetzt === true };
}

async function save(payload: unknown): Promise<{ cards: Draft[]; geschuetzt: boolean }> {
  const response = await fetch("/api/policies", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as { cards?: PolicyEditorCard[]; geschuetzt?: boolean; error?: string };
  if (!response.ok || !body.cards) throw new Error(body.error ?? "Speichern hat nicht geklappt.");
  return { cards: body.cards.map((card) => ({ ...card, key: card.id })), geschuetzt: body.geschuetzt === true };
}
