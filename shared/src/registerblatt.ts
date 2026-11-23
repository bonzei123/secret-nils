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

const PAGE_W = 1080;
const FELT = "#12281d";
const PAPER = "#f4ead4";
const BRIGHT = "#fff8ec";
const INK = "#24180f";
const SOFT = "#6a5642";
const BRASS = "#c6a15b";
const BRASS_DEEP = "#8c6a2e";
const CLUB = "#1f6a45";
const CLUB_DEEP = "#143d2c";
const STAMP = "#a32d2d";
const SERIF = "Fraunces, Georgia, 'Palatino Linotype', serif";
const SANS = "Outfit, 'Segoe UI', sans-serif";

/** Sitzungsbild im Look der Seite: Filz, Papier, Siegel, Stempel, Blätter. */
export function renderProtokollSvg(sheet: Sitzungsprotokoll): string {
  const when = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(sheet.endedAt));
  const winColor = sheet.winner === "verein" ? CLUB : STAMP;
  const pad = 28;
  const innerX = pad + 40;
  const innerW = PAGE_W - pad * 2 - 80;
  const parts: string[] = [];
  let y = pad + 44;

  parts.push(seal(innerX, y));
  const titleX = innerX + 108;
  const titleW = innerX + innerW - titleX;
  parts.push(text(titleX, y + 8, "SITZUNGSPROTOKOLL", 15, 700, BRASS_DEEP, SANS, 2.4));
  const titleLines = wrap(sheet.winTitle, Math.floor(titleW / 22));
  titleLines.forEach((line, index) => {
    parts.push(text(titleX, y + 40 + index * 42, line, 36, 700, INK, SERIF));
  });
  const stampY = y + 48 + titleLines.length * 42;
  parts.push(stamp(titleX, stampY, sheet.winStamp, winColor));
  y = Math.max(y + 108, stampY + 58);

  wrap(sheet.winBody, Math.floor(innerW / 11)).forEach((line) => {
    parts.push(text(innerX, y, line, 20, 500, SOFT, SANS));
    y += 28;
  });
  y += 8;
  parts.push(chip(innerX, y, `${when}   ·   ${formatDuration(sheet.durationMs)}   ·   Raum ${sheet.code}`));
  y += 58;

  y = section(parts, innerX, y, innerW, "Versammlung", [
    {
      title: "Noch drin",
      tone: "good",
      cards: sheet.players.filter((player) => player.alive).map((player) => personCard(player)),
      empty: "Niemand mehr.",
    },
    {
      title: "Raus",
      tone: "bad",
      cards: sheet.players.filter((player) => !player.alive).map((player) => personCard(player)),
      empty: "Niemand ausgeschlossen.",
    },
  ]);
  y += 18;
  y = section(parts, innerX, y, innerW, "Beschlossen", [
    {
      title: "Vereinswohl",
      tone: "good",
      cards: sheet.vereinswohl.map((card) => antragCard(card, "good")),
      empty: "Keiner.",
    },
    {
      title: "Eigeninteresse",
      tone: "bad",
      cards: sheet.eigeninteresse.map((card) => antragCard(card, "bad")),
      empty: "Keiner.",
    },
  ]);
  y += 28;
  parts.push(text(innerX, y, "Fiktives Partyspiel. Keine echten Clubs, Personen oder Organisationen.", 15, 500, SOFT, SANS));
  y += 36;

  const pageH = y + pad;
  const paperH = pageH - pad * 2;
  const id = sheet.id.replace(/[^A-Za-z0-9_-]/g, "") || "blatt";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${pageH}" viewBox="0 0 ${PAGE_W} ${pageH}">
  <defs>
    <pattern id="grain-${id}" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="${PAPER}"/>
      <path d="M0 5H6" stroke="rgba(90,60,20,0.07)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${PAGE_W}" height="${pageH}" fill="${FELT}"/>
  ${feltLeaves(pageH)}
  <rect x="${pad}" y="${pad}" width="${PAGE_W - pad * 2}" height="${paperH}" rx="28" fill="url(#grain-${id})"/>
  ${parts.join("")}
</svg>
`;
}

interface Drawn {
  svg: string;
  height: number;
}

function section(
  parts: string[],
  x: number,
  y: number,
  width: number,
  heading: string,
  columns: { title: string; tone: "good" | "bad"; cards: ((ox: number, oy: number, ow: number) => Drawn)[]; empty: string }[],
): number {
  parts.push(text(x, y, heading.toUpperCase(), 14, 700, BRASS_DEEP, SANS, 2.2));
  y += 28;
  const gap = 16;
  const colW = (width - gap) / 2;
  columns.forEach((column, index) => {
    const origin = x + index * (colW + gap);
    parts.push(leafMark(origin, y - 6, column.tone, 28));
    parts.push(text(origin + 34, y + 16, column.title, 22, 700, INK, SERIF));
  });
  y += 40;
  const bottoms = columns.map((column, index) => {
    const origin = x + index * (colW + gap);
    if (column.cards.length === 0) {
      parts.push(text(origin, y + 22, column.empty, 18, 500, SOFT, SANS));
      return y + 36;
    }
    let cursor = y;
    for (const draw of column.cards) {
      const block = draw(origin, cursor, colW);
      parts.push(block.svg);
      cursor += block.height + 10;
    }
    return cursor;
  });
  return Math.max(...bottoms);
}

function personCard(player: Sitzungsprotokoll["players"][number]): (x: number, y: number, w: number) => Drawn {
  return (x, y, w) => {
    const stripe = player.alive ? CLUB : STAMP;
    const role = `${player.roleTitle}${player.npc ? " · Platzhalter" : ""}`;
    return {
      height: 74,
      svg: `<g>
        <rect x="${x}" y="${y}" width="${w}" height="74" rx="14" fill="${BRIGHT}" stroke="#e0d0ae"/>
        <rect x="${x}" y="${y}" width="8" height="74" rx="4" fill="${stripe}"/>
        <text x="${x + 20}" y="${y + 32}" font-family="${SERIF}" font-size="22" font-weight="700" fill="${INK}">${xml(player.name)}</text>
        <text x="${x + 20}" y="${y + 54}" font-family="${SANS}" font-size="15" fill="${SOFT}">${xml(role)}</text>
      </g>`,
    };
  };
}

function antragCard(card: Sitzungsprotokoll["vereinswohl"][number], tone: "good" | "bad"): (x: number, y: number, w: number) => Drawn {
  return (x, y, w) => {
    const title = wrap(card.title, 28);
    const flavor = wrap(`${card.flavor}${card.chaos ? " · Notverwaltung" : ""}`, 42);
    const height = 24 + title.length * 26 + Math.max(flavor.length, 1) * 20 + 18;
    const bar = tone === "good" ? CLUB : "#b42318";
    const lines = [
      ...title.map((line, index) => text(x + 16, y + 36 + index * 26, line, 20, 700, INK, SERIF)),
      ...flavor.map((line, index) => text(x + 16, y + 42 + title.length * 26 + index * 20, line, 15, 500, SOFT, SANS)),
    ];
    return {
      height,
      svg: `<g>
        <rect x="${x}" y="${y}" width="${w}" height="${height}" rx="14" fill="${BRIGHT}" stroke="#e0d0ae"/>
        <rect x="${x}" y="${y}" width="${w}" height="8" rx="14" fill="${bar}"/>
        <rect x="${x}" y="${y + 8}" width="${w}" height="8" fill="${bar}"/>
        ${leafMark(x + w - 48, y + 16, tone, 34)}
        ${lines.join("")}
      </g>`,
    };
  };
}

function seal(x: number, y: number): string {
  return `<g transform="translate(${x} ${y})">
    <circle cx="46" cy="46" r="46" fill="${CLUB_DEEP}" stroke="${BRASS}" stroke-width="4"/>
    <circle cx="46" cy="46" r="38" fill="none" stroke="${BRASS}" stroke-width="1" opacity="0.7"/>
    ${leafMark(14, 14, "club", 64)}
  </g>`;
}

function stamp(x: number, y: number, label: string, color: string): string {
  const width = Math.max(150, label.length * 13 + 28);
  return `<g transform="translate(${x} ${y}) rotate(-6)">
    <rect x="0" y="0" width="${width}" height="38" rx="4" fill="none" stroke="${color}" stroke-width="3"/>
    <text x="${width / 2}" y="26" text-anchor="middle" font-family="${SERIF}" font-size="16" font-weight="700" letter-spacing="1.5" fill="${color}">${xml(label.toUpperCase())}</text>
  </g>`;
}

function chip(x: number, y: number, label: string): string {
  const width = label.length * 9.2 + 32;
  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="36" rx="18" fill="${BRIGHT}" stroke="${BRASS}"/>
    <text x="${x + 14}" y="${y + 24}" font-family="${SANS}" font-size="15" font-weight="600" fill="${BRASS_DEEP}">${xml(label)}</text>
  </g>`;
}

function text(
  x: number | string,
  y: number | string,
  value: string,
  size: number,
  weight: number,
  fill: string,
  family: string,
  tracking = 0,
): string {
  const space = tracking ? ` letter-spacing="${tracking}"` : "";
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}"${space}>${xml(value)}</text>`;
}

function leafMark(x: number | string, y: number | string, tone: "good" | "bad" | "club", size: number): string {
  const color = tone === "bad" ? "#b42318" : tone === "club" ? "#c8f0b4" : CLUB;
  const scale = (size / 64).toFixed(3);
  const leaflets = [
    [0, 32],
    [-32, 28],
    [32, 28],
    [-62, 23],
    [62, 23],
    [-96, 16],
    [96, 16],
  ]
    .map(([angle, length]) => `<path d="${leafletPath(length ?? 16)}" transform="translate(32 44) rotate(${angle})"/>`)
    .join("");
  const dollar =
    tone === "bad"
      ? `<circle cx="32" cy="31" r="10" fill="#fff6ee"/><text x="32" y="36.5" text-anchor="middle" font-size="16" font-weight="800" fill="#9d1c1c" font-family="${SERIF}">$</text>`
      : "";
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="${color}" stroke="${color}">
    ${leaflets}
    <path d="M32 44c.4 6 .1 11 0 16" fill="none" stroke-width="2.3" stroke-linecap="round"/>
    <path d="M32 52c-8 3-10 7-6 9M32 54c8 2 11 6 7 9" fill="none" stroke-width="1.6" stroke-linecap="round"/>
    ${dollar}
  </g>`;
}

function leafletPath(length: number): string {
  const waist = length * 0.16;
  const mid = length * 0.72;
  return `M0 0C${-waist} ${-length * 0.42} ${-waist * 0.8} ${-mid} 0 ${-length}C${waist * 0.8} ${-mid} ${waist} ${-length * 0.42} 0 0`;
}

function feltLeaves(height: number): string {
  const spots = [
    [80, 80, -18],
    [980, 140, 24],
    [120, height - 90, 12],
    [960, height - 120, -30],
  ];
  return spots
    .map(([x, y, turn]) => `<g opacity="0.16" transform="translate(${x} ${y}) rotate(${turn})">${leafMark(0, 0, "club", 72)}</g>`)
    .join("");
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
