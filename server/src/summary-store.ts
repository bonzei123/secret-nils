import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Sitzungsprotokoll } from "@secret-nils/shared";

const MAX_SHEETS = 80;

export class SummaryStore {
  private items: Sitzungsprotokoll[] = [];

  constructor(private readonly filePath: string) {
    this.items = this.read();
  }

  put(sheet: Sitzungsprotokoll): void {
    this.items = [sheet, ...this.items.filter((entry) => entry.id !== sheet.id)].slice(0, MAX_SHEETS);
    this.write();
  }

  get(id: string): Sitzungsprotokoll | null {
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return null;
    return this.items.find((entry) => entry.id === id) ?? null;
  }

  private read(): Sitzungsprotokoll[] {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Sitzungsprotokoll[];
      return Array.isArray(parsed) ? parsed.slice(0, MAX_SHEETS) : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(this.items, null, 2)}\n`, "utf8");
  }
}
