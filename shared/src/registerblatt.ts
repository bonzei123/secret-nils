import { formatDuration, type Sitzungsprotokoll } from "./summary";

export interface RegisterEintrag {
  datei: string;
  zeit: string;
  code: string;
  winner: Sitzungsprotokoll["winner"];
  dauer: string;
  id: string;
}

const DATEI =
  /^(\d{8})-(\d{6})_([A-Z0-9]{4})_(verein|kluengel)_(\d+h\d{2}m|\d+m\d{2}s|\d+s)_([A-Za-z0-9_-]{8,40})\.svg$/;

/** Alles, was die Liste braucht, steht im Dateinamen. Die Zeichnung selbst ist die Sitzung. */
export function protokollDatei(sheet: Sitzungsprotokoll): string {
  return `${zeitstempel(sheet.endedAt)}_${sheet.code}_${sheet.winner}_${dauerToken(sheet.durationMs)}_${sheet.id}.svg`;
}

export function parseProtokollDatei(name: string): RegisterEintrag | null {
  const match = DATEI.exec(name);
  if (!match) return null;
  const [, day, clock, code, winner, dauer, id] = match;
  if (!day || !clock || !code || (winner !== "verein" && winner !== "kluengel") || !dauer || !id) return null;
  return {
    datei: name,
    zeit: `${day.slice(6, 8)}.${day.slice(4, 6)}.${day.slice(0, 4)}, ${clock.slice(0, 2)}:${clock.slice(2, 4)}`,
    code,
    winner,
    dauer: dauerText(dauer),
    id,
  };
}

export function renderProtokollSvg(sheet: Sitzungsprotokoll): string {
  const when = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(sheet.endedAt));
  const lines: { text: string; size: number; weight: number; color: string; gap: number }[] = [
    { text: "Secret Nils · Registergericht", size: 18, weight: 700, color: "#6b4e16", gap: 28 },
    { text: sheet.winTitle, size: 32, weight: 700, color: "#24170f", gap: 36 },
    { text: sheet.winStamp, size: 20, weight: 700, color: sheet.winner === "verein" ? "#1f6b3a" : "#8c1d18", gap: 28 },
    { text: sheet.winBody, size: 18, weight: 400, color: "#4a3b2a", gap: 26 },
    { text: `${when} · ${formatDuration(sheet.durationMs)} · Raum ${sheet.code}`, size: 16, weight: 400, color: "#4a3b2a", gap: 34 },
    { text: "Noch drin", size: 20, weight: 700, color: "#24170f", gap: 26 },
    ...peopleLines(sheet, true),
    { text: "Raus", size: 20, weight: 700, color: "#24170f", gap: 26 },
    ...peopleLines(sheet, false),
    { text: "Vereinswohl", size: 20, weight: 700, color: "#1f6b3a", gap: 26 },
    ...antragLines(sheet.vereinswohl, "Keiner."),
    { text: "Eigeninteresse", size: 20, weight: 700, color: "#8c1d18", gap: 26 },
    ...antragLines(sheet.eigeninteresse, "Keiner."),
    { text: "Fiktives Partyspiel. Keine echten Clubs.", size: 14, weight: 400, color: "#6d5c49", gap: 20 },
  ];
  const wrapped = lines.flatMap((line) =>
    wrap(line.text, line.size >= 28 ? 34 : 48).map((text, index, all) => ({
      text,
      size: line.size,
      weight: line.weight,
      color: line.color,
      gap: index === all.length - 1 ? line.gap : Math.round(line.size * 1.25),
    })),
  );
  const height = 56 + wrapped.reduce((sum, line) => sum + line.gap, 0);
  const bar = sheet.winner === "verein" ? "#1f6b3a" : "#8c1d18";
  let y = 48;
  const texts = wrapped
    .map((line) => {
      const node = `<text x="48" y="${y}" font-family="Georgia, serif" font-size="${line.size}" font-weight="${line.weight}" fill="${line.color}">${xml(line.text)}</text>`;
      y += line.gap;
      return node;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}" viewBox="0 0 900 ${height}">
  <rect width="900" height="${height}" fill="#f6efe2"/>
  <rect width="900" height="14" fill="#1f6b3a"/>
  <rect y="${height - 14}" width="900" height="14" fill="${bar}"/>
  ${texts}
</svg>
`;
}

function peopleLines(sheet: Sitzungsprotokoll, alive: boolean): { text: string; size: number; weight: number; color: string; gap: number }[] {
  const people = sheet.players.filter((player) => player.alive === alive);
  if (people.length === 0) {
    return [{ text: alive ? "Niemand mehr." : "Niemand ausgeschlossen.", size: 18, weight: 400, color: "#24170f", gap: 28 }];
  }
  return people.map((player) => ({
    text: `${player.name} — ${player.roleTitle}${player.npc ? " (Platzhalter)" : ""}`,
    size: 18,
    weight: 400,
    color: "#24170f",
    gap: 26,
  }));
}

function antragLines(
  cards: Sitzungsprotokoll["vereinswohl"],
  empty: string,
): { text: string; size: number; weight: number; color: string; gap: number }[] {
  if (cards.length === 0) return [{ text: empty, size: 18, weight: 400, color: "#24170f", gap: 30 }];
  return cards.map((card) => ({
    text: `${card.title}${card.chaos ? " (Notverwaltung)" : ""}${card.flavor ? ` — ${card.flavor}` : ""}`,
    size: 18,
    weight: 400,
    color: "#24170f",
    gap: 28,
  }));
}

function zeitstempel(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${pick("year")}${pick("month")}${pick("day")}-${pick("hour")}${pick("minute")}${pick("second")}`;
}

function dauerToken(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

function dauerText(token: string): string {
  const hours = token.match(/^(\d+)h(\d{2})m$/);
  if (hours) return `${hours[1]} Std. ${Number(hours[2])} Min.`;
  const minutes = token.match(/^(\d+)m(\d{2})s$/);
  if (minutes) return `${minutes[1]} Min. ${Number(minutes[2])} Sek.`;
  return `${token.replace("s", "")} Sek.`;
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0] ?? "";
  for (const word of words.slice(1)) {
    const next = `${current} ${word}`;
    if (next.length > max) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  lines.push(current);
  return lines;
}

function xml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    return "&quot;";
  });
}
