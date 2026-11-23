import { useEffect, useState } from "react";
import { formatDuration, type Sitzungsprotokoll } from "@secret-nils/shared";
import { usePublicOrigin } from "./origin";
import { Logo, Wordmark } from "./ui";

export function ProtokollSheet({ protokoll }: { protokoll: Sitzungsprotokoll }) {
  const origin = usePublicOrigin();
  const link = `${origin}/protokoll/${protokoll.id}`;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch(`/api/protokoll/${id}`)
      .then(async (response) => {
        const body = (await response.json()) as Sitzungsprotokoll & { error?: string };
        if (!live) return;
        if (!response.ok) setError(body.error ?? "Das Protokoll ist nicht angekommen.");
        else setSheet(body);
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
      {!sheet && !error && <p>Das Protokoll wird aus dem Schrank geholt.</p>}
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
  const width = 900;
  const pad = 48;
  const inner = width - pad * 2;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kein Bild.");
  ctx.font = "28px Georgia, serif";
  const blocks = layout(protokoll, ctx, inner);
  const height = blocks.reduce((sum, block) => sum + block.height, pad * 2);
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#f6efe2";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#1f6b3a";
  ctx.fillRect(0, 0, width, 14);
  ctx.fillStyle = protokoll.winner === "verein" ? "#1f6b3a" : "#8c1d18";
  ctx.fillRect(0, height - 14, width, 14);
  let y = pad + 8;
  for (const block of blocks) {
    ctx.fillStyle = "#24170f";
    ctx.font = block.font;
    ctx.textBaseline = "top";
    for (const line of block.lines) {
      ctx.fillStyle = block.color;
      ctx.fillText(line, pad, y);
      y += block.lineHeight;
    }
    y += block.gap;
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Das Bild ließ sich nicht schreiben.");
  return blob;
}

interface Block {
  lines: string[];
  font: string;
  lineHeight: number;
  gap: number;
  height: number;
  color: string;
}

function layout(protokoll: Sitzungsprotokoll, ctx: CanvasRenderingContext2D, width: number): Block[] {
  const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(protokoll.startedAt));
  const inside = protokoll.players.filter((player) => player.alive).map((player) => personLine(player));
  const outside = protokoll.players.filter((player) => !player.alive).map((player) => personLine(player));
  const good = protokoll.vereinswohl.map((card) => antragLine(card));
  const bad = protokoll.eigeninteresse.map((card) => antragLine(card));
  const raw: { text: string; font: string; line: number; gap: number; color: string }[] = [
    { text: "Secret Nils", font: "700 22px Georgia, serif", line: 30, gap: 4, color: "#6b4e16" },
    { text: protokoll.winTitle, font: "700 40px Georgia, serif", line: 48, gap: 8, color: "#24170f" },
    { text: protokoll.winStamp, font: "700 22px Georgia, serif", line: 30, gap: 8, color: protokoll.winner === "verein" ? "#1f6b3a" : "#8c1d18" },
    { text: protokoll.winBody, font: "22px Georgia, serif", line: 30, gap: 12, color: "#4a3b2a" },
    { text: `${when} · ${formatDuration(protokoll.durationMs)} · Raum ${protokoll.code}`, font: "20px Georgia, serif", line: 28, gap: 18, color: "#4a3b2a" },
    { text: "Noch drin", font: "700 24px Georgia, serif", line: 32, gap: 6, color: "#24170f" },
    { text: inside.join("\n") || "Niemand mehr.", font: "22px Georgia, serif", line: 30, gap: 14, color: "#24170f" },
    { text: "Raus", font: "700 24px Georgia, serif", line: 32, gap: 6, color: "#24170f" },
    { text: outside.join("\n") || "Niemand ausgeschlossen.", font: "22px Georgia, serif", line: 30, gap: 14, color: "#24170f" },
    { text: "Vereinswohl", font: "700 24px Georgia, serif", line: 32, gap: 6, color: "#1f6b3a" },
    { text: good.join("\n") || "Keiner.", font: "22px Georgia, serif", line: 30, gap: 14, color: "#24170f" },
    { text: "Eigeninteresse", font: "700 24px Georgia, serif", line: 32, gap: 6, color: "#8c1d18" },
    { text: bad.join("\n") || "Keiner.", font: "22px Georgia, serif", line: 30, gap: 8, color: "#24170f" },
    { text: "Fiktives Partyspiel. Keine echten Clubs.", font: "18px Georgia, serif", line: 26, gap: 0, color: "#6d5c49" },
  ];
  return raw.map((entry) => {
    ctx.font = entry.font;
    const lines = entry.text.split("\n").flatMap((paragraph) => wrap(ctx, paragraph, width));
    return {
      lines,
      font: entry.font,
      lineHeight: entry.line,
      gap: entry.gap,
      height: lines.length * entry.line + entry.gap,
      color: entry.color,
    };
  });
}

function personLine(player: Sitzungsprotokoll["players"][number]): string {
  return `${player.name} — ${player.roleTitle}${player.npc ? " (Platzhalter)" : ""}`;
}

function antragLine(card: Sitzungsprotokoll["vereinswohl"][number]): string {
  return `${card.title}${card.chaos ? " (Notverwaltung)" : ""}${card.flavor ? ` — ${card.flavor}` : ""}`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0] ?? "";
  for (const word of words.slice(1)) {
    const next = `${current} ${word}`;
    if (ctx.measureText(next).width > width) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  lines.push(current);
  return lines;
}
