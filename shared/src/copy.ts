import type { ExecutivePower, Phase, Role, WinReason } from "./types";

export function roleTitle(role: Role): string {
  switch (role) {
    case "ehrliches_mitglied":
      return "Ehrliches Mitglied";
    case "linientreuer":
      return "Linientreuer Festangestellter";
    case "nils":
      return "Nils";
  }
}

export function roleBrief(role: Role, knowsStaff: boolean): string {
  switch (role) {
    case "ehrliches_mitglied":
      return "Du willst einen sauberen, transparenten Club. Du kennst niemanden sonst. Verhindere Eigeninteresse-Beschlüsse und sorge dafür, dass Nils nicht an die Kasse kommt — oder stelle ihn auf einer Jahreshauptversammlung zur Nicht-Entlastung.";
    case "linientreuer":
      return "Dein Arbeitsvertrag kommt vom geheimen Vorstand. Du kennst Nils und die anderen Festangestellten. Bringt Eigeninteresse durch und hievt Nils in die Kasse, ohne dass die Mitgliederversammlung euch auffliegen lässt.";
    case "nils":
      return knowsStaff
        ? "Du bist der heimliche Drahtzieher und kennst deine linientreuen Festangestellten. Wirke harmlos. Nach drei Eigeninteresse-Beschlüssen reicht deine Wahl zum Kassenwart. Lass dich auf keiner Jahreshauptversammlung ausschließen."
        : "Du bist der heimliche Drahtzieher. In dieser Rundengröße kennst du deine linientreuen Festangestellten nicht — sie kennen dich. Wirke harmlos. Nach drei Eigeninteresse-Beschlüssen reicht deine Wahl zum Kassenwart.";
  }
}

export function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "briefing":
      return "Mitgliederausweise";
    case "nominating":
      return "Wahl des Kassenwarts";
    case "voting":
      return "Mitgliederabstimmung";
    case "legislative_president":
      return "Vorlagen sichten";
    case "legislative_chancellor":
      return "Beschluss fassen";
    case "veto_request":
      return "Formfehler-Rüge";
    case "executive":
      return "Sonderaktion";
    case "game_over":
      return "Sitzung beendet";
  }
}

export function powerLabel(power: ExecutivePower): string {
  switch (power) {
    case "none":
      return "Keine Sonderaktion";
    case "kassenpruefung":
      return "Kassenprüfung";
    case "sondersitzung":
      return "Sondersitzung";
    case "tagesordnung":
      return "Tagesordnung";
    case "nicht_entlastung":
      return "Nicht-Entlastung";
  }
}

export function powerHint(power: ExecutivePower): string {
  switch (power) {
    case "none":
      return "Dieser Beschluss löst keine Sonderaktion aus.";
    case "kassenpruefung":
      return "Der 1. Vorsitz prüft die Vereinsakte eines Mitglieds und erfährt nur das Lager: ehrlich oder Klüngel. Nils erscheint dabei als Klüngel.";
    case "sondersitzung":
      return "Der 1. Vorsitz bestimmt eine andere Person, die sofort einmalig den Vorsitz übernimmt. Danach wandert das Amt weiter, als hätte der einberufende Vorsitz die Runde behalten.";
    case "tagesordnung":
      return "Der 1. Vorsitz sieht verdeckt die drei obersten Beschlussvorlagen. Sie bleiben auf dem Stapel.";
    case "nicht_entlastung":
      return "Außerordentliche Jahreshauptversammlung: Ein Mitglied wird nicht entlastet, verliert alle Ämter und scheidet aus. Ist es Nils, gewinnen sofort die ehrlichen Mitglieder.";
  }
}

export interface WinCopy {
  title: string;
  body: string;
  stamp: string;
}

export function winCopy(reason: WinReason): WinCopy {
  switch (reason) {
    case "vereinswohl_track":
      return {
        title: "Der Club bleibt in Mitgliederhand",
        body: "Fünf Vereinswohl-Beschlüsse. Buchführung, Qualität und Beiträge gehören dem Verein, nicht dem Klüngel.",
        stamp: "Verein gewinnt",
      };
    case "nils_ausgeschlossen":
      return {
        title: "Nils ist nicht entlastet",
        body: "Die Jahreshauptversammlung hat Nils ausgeschlossen. Der Klüngel verliert seinen Drahtzieher.",
        stamp: "Nicht entlastet",
      };
    case "eigeninteresse_track":
      return {
        title: "Die Kasse gehört dem Klüngel",
        body: "Sechs Eigeninteresse-Beschlüsse. Beraterpauschalen, Privatkonten, Dienstwagen — der Verein ist zur Selbstbedienung geworden.",
        stamp: "Klüngel gewinnt",
      };
    case "nils_kassenwart":
      return {
        title: "Nils sitzt an der Kasse",
        body: "Nach mindestens drei Eigeninteresse-Beschlüssen wurde Nils zum Kassenwart gewählt. Die Konten sind weg.",
        stamp: "Kasse übernommen",
      };
  }
}

export const TIMER_CHOICES = [30, 45, 60, 90, 120, 180] as const;
export type TimerChoice = (typeof TIMER_CHOICES)[number];

export const SEAT_COLORS = [
  "#2f6d4f",
  "#8a4b2f",
  "#315f86",
  "#6b3f86",
  "#8d3d49",
  "#3c6f78",
  "#8a6a2f",
  "#4e6840",
  "#7a3e5c",
  "#3e5348",
] as const;

export const RULES: readonly { heading: string; body: string }[] = [
  {
    heading: "Worum es geht",
    body: "Ihr seid ein frisch gegründeter Cannabis Social Club. Die ehrlichen Mitglieder wollen den Verein transparent führen. Ein kleiner Klüngel — linientreue Festangestellte plus ihr Drahtzieher Nils — will Eigeninteresse durchdrücken.",
  },
  {
    heading: "Ausweise",
    body: "Bei 5–6 Mitgliedern kennen sich Nils und die Festangestellten. Ab 7 kennen die Festangestellten Nils, Nils kennt sie nicht. Ehrliche Mitglieder tappen im Dunkeln. Zeig deinen Ausweis nicht herum.",
  },
  {
    heading: "Vorstandswahl",
    body: "Der 1. Vorsitz wandert im Uhrzeigersinn und schlägt einen Kassenwart vor. Alle lebenden Mitglieder stimmen geheim mit Zustimmen oder Ablehnen. Gleichstand scheitert. Danach sieht jeder, wer wie gestimmt hat.",
  },
  {
    heading: "Amtsperre",
    body: "Der zuletzt gewählte Kassenwart darf nicht sofort wieder kandidieren. Ab fünf verbliebenen Mitgliedern gilt das auch für den letzten 1. Vorsitz. Nach einer Notverwaltung ist die Sperre aufgehoben.",
  },
  {
    heading: "Beschlüsse",
    body: "Der Vorsitz zieht drei Vorlagen, wirft eine in den Reißwolf und gibt zwei an die Kasse. Der Kassenwart setzt eine um. Fünf Vereinswohl-Beschlüsse gewinnen für den Verein, sechs Eigeninteresse-Beschlüsse für den Klüngel.",
  },
  {
    heading: "Notverwaltung",
    body: "Drei Regierungen in Folge ohne Beschluss — abgelehnte Wahlen oder eine anerkannte Formfehler-Rüge — und die oberste Vorlage gilt automatisch. Sonderaktionen gibt es dabei nicht. Der Tracker setzt sich zurück, sobald irgendein Beschluss in Kraft tritt.",
  },
  {
    heading: "Sonderaktionen",
    body: "Stehen auf dem Eigeninteresse-Track: Kassenprüfung (Lager, nicht die exakte Rolle; Nils zählt als Klüngel), Sondersitzung, Blick in die Tagesordnung, und die Jahreshauptversammlung mit Nicht-Entlastung. Wird Nils ausgeschlossen, gewinnen die ehrlichen Mitglieder sofort.",
  },
  {
    heading: "Nils an der Kasse",
    body: "Wird Nils zum Kassenwart gewählt, während schon mindestens drei Eigeninteresse-Beschlüsse gelten, gewinnt der Klüngel sofort — noch bevor neue Vorlagen gezogen werden.",
  },
  {
    heading: "Formfehler",
    body: "Ab dem fünften Eigeninteresse-Beschluss können Kasse und Vorsitz eine Vorlage gemeinsam als satzungswidrig verwerfen. Lehnt der Vorsitz ab, muss die Kasse einen Beschluss umsetzen.",
  },
];
