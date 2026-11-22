import type { PolicyCard } from "./types";

/**
 * Fiktive Vereinsanträge. Keine echten Clubs, Personen oder Organisationen.
 * 6 Vereinswohl, 11 Eigeninteresse — analog zur klassischen Kartenverteilung.
 */
export const CATALOG: readonly PolicyCard[] = [
  {
    id: "vw-1",
    type: "vereinswohl",
    title: "Transparente Buchführung",
    flavor: "Jede Ausgabe liegt im Vereinsheim aus. Sogar die für Pflanzenerde.",
  },
  {
    id: "vw-2",
    type: "vereinswohl",
    title: "Laborgeprüfte Qualität",
    flavor: "Chargen, Labor und ein Regal, das nicht nur aus Hoffnung besteht.",
  },
  {
    id: "vw-3",
    type: "vereinswohl",
    title: "Faire Selbstkosten-Abgabe",
    flavor: "Der Beitrag deckt Kosten, nicht den Zweitwagen des Kassenwarts.",
  },
  {
    id: "vw-4",
    type: "vereinswohl",
    title: "Präventionskonzept verabschiedet",
    flavor: "Aufklärung, Jugendschutz und ein Aushang, den wirklich jemand liest.",
  },
  {
    id: "vw-5",
    type: "vereinswohl",
    title: "Gemeinnützige Rücklagen",
    flavor: "Überschuss bleibt im Club: Rücklagen, keine stillen Boni.",
  },
  {
    id: "vw-6",
    type: "vereinswohl",
    title: "Offene Sprechstunde",
    flavor: "Mitgliederfragen werden protokolliert, nicht im Flur abgewimmelt.",
  },
  {
    id: "ei-1",
    type: "eigeninteresse",
    title: "Intransparente Beraterpauschale",
    flavor: "Ein externer Berater, verwandt, teuer. Ergebnis: eine PDF mit dem Wort Synergie.",
  },
  {
    id: "ei-2",
    type: "eigeninteresse",
    title: "Exklusivvertrag mit der Schwager-Gärtnerei",
    flavor: "Der Lieferant ist gesetzt. Zufällig derselbe Nachname wie auf dem Antrag.",
  },
  {
    id: "ei-3",
    type: "eigeninteresse",
    title: "Unbefristete Vollzeitstellen für Günstlinge",
    flavor: "Drei neue Leitungen, null Ausschreibung, ein gemeinsamer Urlaubs-Chat.",
  },
  {
    id: "ei-4",
    type: "eigeninteresse",
    title: "Bargeld-Spesenkasse ohne Belege",
    flavor: "Quittungen gelten als Bürokratie. Der Umschlag kennt die Beträge schon.",
  },
  {
    id: "ei-5",
    type: "eigeninteresse",
    title: "Verdeckte Lizenzgebühren",
    flavor: "Für die Marke, das Logo und das Recht, das Logo zu benutzen. Empfänger: vertraulich.",
  },
  {
    id: "ei-6",
    type: "eigeninteresse",
    title: "Dienstwagen für den erweiterten Vorstand",
    flavor: "Ein Kombi. Ausschließlich für Vereinsfahrten. Definitiv nur dafür.",
  },
  {
    id: "ei-7",
    type: "eigeninteresse",
    title: "Rückwirkende Sondervergütung",
    flavor: "Der Beschluss gilt ab letztem März. Die Überweisung ging gestern raus.",
  },
  {
    id: "ei-8",
    type: "eigeninteresse",
    title: "Scheinselbstständige Erntekraft",
    flavor: "Selbstständig auf dem Papier, weisungsgebunden in der Satzungswirklichkeit.",
  },
  {
    id: "ei-9",
    type: "eigeninteresse",
    title: "Vereinskonto auf Privatnamen",
    flavor: "Nur übergangsweise. Der Übergang dauert seit der Gründungsversammlung.",
  },
  {
    id: "ei-10",
    type: "eigeninteresse",
    title: "Geheimprotokoll zur Kassenprüfung",
    flavor: "Die Prüfung fand statt. Das Protokoll ist aus Datenschutzgründen geheim.",
  },
  {
    id: "ei-11",
    type: "eigeninteresse",
    title: "Goldene Gießkanne als Aufwandsentschädigung",
    flavor: "Symbolisch, massiv und erstaunlich gut weiterverkaufbar.",
  },
] as const;

export function createCatalog(): PolicyCard[] {
  return CATALOG.map((card) => ({ ...card }));
}

export const VEREINSWOHL_TO_WIN = 5;
export const EIGENINTERESSE_TO_WIN = 6;
export const EIGENINTERESSE_BEFORE_NILS = 3;
export const VETO_UNLOCK_AT = 5;
export const CHAOS_AT = 3;
