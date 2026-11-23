import { useEffect, useState } from "react";
import { formatDuration, renderProtokollSvg, type Sitzungsprotokoll } from "@secret-nils/shared";
import { usePublicOrigin } from "./origin";
import { Logo, Wordmark } from "./ui";

export function ProtokollSheet({ protokoll }: { protokoll: Sitzungsprotokoll }) {
  const origin = usePublicOrigin();
  const link = protokoll.datei ? `${origin}/registergericht/${protokoll.datei}` : `${origin}/protokoll/${protokoll.id}`;
  const [note, setNote] = useState("");
  const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(protokoll.startedAt));
  const inside = protokoll.players.filter((player) => player.alive);
  const outside = protokoll.players.filter((player) => !player.alive);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setNote("Link kopiert.");
    } catch {
      setNote(link);
    }
  }

  async function share() {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({ title: "Sitzungsprotokoll", text: protokoll.winTitle, url: link });
    } catch {
      /* Abbruch ist kein Fehler. */
    }
  }

  async function download() {
    const blob = await renderPng(protokoll);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `secret-nils-${protokoll.code}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <article className="sheet">
      <p className="kicker">Sitzungsprotokoll · Raum {protokoll.code}</p>
      <h2>{protokoll.winTitle}</h2>
      <p className={`role-stamp ${protokoll.winner === "verein" ? "verein" : ""}`}>{protokoll.winStamp}</p>
      <p>{protokoll.winBody}</p>
      <p className="meta-line">
        {when} · Dauer {formatDuration(protokoll.durationMs)}
      </p>
      <div className="sheet-grid">
        <section>
          <h3>Noch drin</h3>
          <ul>
            {inside.map((player) => (
              <li key={player.name}>
                <strong>{player.name}</strong>
                <span>
                  {player.roleTitle}
                  {player.npc ? " · Platzhalter" : ""}
                </span>
              </li>
            ))}
            {inside.length === 0 && <li>Niemand mehr.</li>}
          </ul>
        </section>
        <section>
          <h3>Raus</h3>
          <ul>
            {outside.map((player) => (
              <li key={player.name}>
                <strong>{player.name}</strong>
                <span>
                  {player.roleTitle}
                  {player.npc ? " · Platzhalter" : ""}
                </span>
              </li>
            ))}
            {outside.length === 0 && <li>Niemand ausgeschlossen.</li>}
          </ul>
        </section>
      </div>
      <div className="sheet-grid">
        <AntragList title="Vereinswohl" cards={protokoll.vereinswohl} />
        <AntragList title="Eigeninteresse" cards={protokoll.eigeninteresse} />
      </div>
      <div className="btn-row">
        <button type="button" className="btn secondary" onClick={() => void copyLink()}>
          Link kopieren
        </button>
        <button type="button" className="btn secondary" onClick={() => void share()}>
          Teilen
        </button>
        <button type="button" className="btn" onClick={() => void download()}>
          Als PNG speichern
        </button>
      </div>
      {note && <p className="meta-line">{note}</p>}
    </article>
  );
}

function AntragList({ title, cards }: { title: string; cards: Sitzungsprotokoll["vereinswohl"] }) {
  return (
    <section>
      <h3>{title}</h3>
      {cards.length === 0 ? (
        <p className="meta-line">Keiner.</p>
      ) : (
        <ul>
          {cards.map((card) => (
            <li key={card.title}>
              <strong>{card.title}</strong>
              <span>
                {card.flavor}
                {card.chaos ? " · Notverwaltung" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ProtokollPage({ id }: { id: string }) {
  const [sheet, setSheet] = useState<Sitzungsprotokoll | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch(`/api/protokoll/${id}`)
      .then(async (response) => {
        const body = (await response.json()) as Sitzungsprotokoll & { datei?: string; error?: string };
        if (!live) return;
        if (!response.ok) setError(body.error ?? "Das Protokoll ist nicht angekommen.");
        else if (body.winTitle) setSheet(body);
        else if (body.datei) setImage(`/registergericht/${body.datei}`);
        else setError("Das Protokoll ist nicht angekommen.");
      })
      .catch(() => {
        if (live) setError("Das Protokoll ist nicht angekommen.");
      });
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <main className="center-card">
      <header className="masthead">
        <Logo />
        <div>
          <p className="kicker">Nach der Sitzung</p>
          <h1>
            <Wordmark>Übersicht</Wordmark>
          </h1>
        </div>
      </header>
      {error && <p className="note-warn">{error}</p>}
      {!sheet && !image && !error && <p>Das Protokoll wird aus dem Schrank geholt.</p>}
      {image && (
        <a href={image}>
          <img className="register-shot" src={image} alt="Sitzungsprotokoll" />
        </a>
      )}
      {sheet && <ProtokollSheet protokoll={sheet} />}
      <p className="meta-line">
        <a href="/">Zurück zum Vereinsheim</a>
      </p>
    </main>
  );
}

export function protokollIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/protokoll\/([A-Za-z0-9_-]{8,40})\/?$/);
  return match?.[1] ?? null;
}

async function renderPng(protokoll: Sitzungsprotokoll): Promise<Blob> {
  const svg = renderProtokollSvg(protokoll);
  const width = Number(svg.match(/width="(\d+)"/)?.[1] ?? 1080);
  const height = Number(svg.match(/height="(\d+)"/)?.[1] ?? 1400);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = await loadImage(url);
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Kein Bild.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Das Bild ließ sich nicht schreiben.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Das Bild ließ sich nicht zeichnen."));
    image.src = url;
  });
}
