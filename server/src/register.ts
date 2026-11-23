import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseProtokollDatei, protokollDatei, renderProtokollSvg, type RegisterEintrag } from "@secret-nils/shared";
import type { Sitzungsprotokoll } from "@secret-nils/shared";

/** Ein Ordner, eine Datei pro Sitzung. Weg mit der Datei, weg mit dem Eintrag. */
export class RegisterArchive {
  constructor(private readonly directory: string) {}

  save(sheet: Sitzungsprotokoll): string {
    const datei = protokollDatei(sheet);
    mkdirSync(this.directory, { recursive: true });
    const target = path.join(this.directory, datei);
    if (!existsSync(target)) writeFileSync(target, renderProtokollSvg(sheet), "utf8");
    return datei;
  }

  list(): RegisterEintrag[] {
    let names: string[] = [];
    try {
      names = readdirSync(this.directory);
    } catch {
      return [];
    }
    return names
      .map((name) => parseProtokollDatei(name))
      .filter((entry): entry is RegisterEintrag => entry !== null)
      .sort((a, b) => b.datei.localeCompare(a.datei));
  }

  resolve(datei: string): string | null {
    const parsed = parseProtokollDatei(datei);
    if (!parsed) return null;
    const full = path.join(this.directory, parsed.datei);
    return existsSync(full) ? full : null;
  }
}
