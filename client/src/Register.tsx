import { useEffect, useState } from "react";
import type { RegisterEintrag } from "@secret-nils/shared";
import { Logo, Wordmark } from "./ui";

export function RegisterPage() {
  const [entries, setEntries] = useState<RegisterEintrag[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/register")
      .then(async (response) => {
        const body = (await response.json()) as { eintraege?: RegisterEintrag[]; error?: string };
        if (!live) return;
        if (!response.ok || !body.eintraege) setError(body.error ?? "Das Register ist nicht angekommen.");
        else setEntries(body.eintraege);
      })
      .catch(() => {
        if (live) setError("Das Register ist nicht angekommen.");
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <main className="center-card register">
      <header className="masthead">
        <Logo />
        <div>
          <p className="kicker">Nach den Sitzungen</p>
          <h1>
            <Wordmark>Registergericht</Wordmark>
          </h1>
        </div>
      </header>
      <p className="lede">
        Jede beendete Sitzung liegt als Bild im Ordner <code>registergericht</code>. Datum, Raum und Ausgang stehen im Dateinamen. Löschst du die Datei, ist der Eintrag weg.
      </p>
      {error && <p className="note-warn">{error}</p>}
      {entries && entries.length === 0 && <p>Noch keine Sitzung im Register.</p>}
      <div className="register-list">
        {entries?.map((entry) => (
          <article key={entry.datei} className="sheet">
            <p className="kicker">
              {entry.zeit} · Raum {entry.code} · {entry.dauer}
            </p>
            <h2>{entry.winner === "verein" ? "Verein" : "Klüngel"}</h2>
            <a href={`/registergericht/${entry.datei}`}>
              <img src={`/registergericht/${entry.datei}`} alt={`Sitzung ${entry.code} vom ${entry.zeit}`} />
            </a>
          </article>
        ))}
      </div>
      <p className="meta-line">
        <a href="/">Zurück zum Vereinsheim</a>
      </p>
    </main>
  );
}
