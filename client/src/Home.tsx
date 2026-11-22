import { useMemo, useState } from "react";
import { RULES, TIMER_CHOICES } from "@secret-nils/shared";
import { Logo } from "./ui";

interface HomeProps {
  connected: boolean;
  onCreate: (name: string, timer: number, shuffle: boolean) => Promise<unknown>;
  onJoin: (code: string, name: string) => Promise<unknown>;
}

export function Home({ connected, onCreate, onJoin }: HomeProps) {
  const preset = useMemo(() => new URLSearchParams(window.location.search).get("beitritt") ?? "", []);
  const [name, setName] = useState(() => localStorage.getItem("secret-nils-name") ?? "");
  const [code, setCode] = useState(preset);
  const [timer, setTimer] = useState<number>(90);
  const [shuffle, setShuffle] = useState(false);
  const [busy, setBusy] = useState(false);

  function remember(next: string) {
    setName(next);
    localStorage.setItem("secret-nils-name", next);
  }

  return (
    <main className="center-card">
      <header className="masthead">
        <Logo />
        <div>
          <p className="kicker">Cannabis Social Club · fiktive Satzung</p>
          <h1>Secret Nils</h1>
        </div>
      </header>
      <p className="lede">
        Fünf bis zehn Mitglieder, ein Vereinsheim, zwei Lager. Die ehrlichen Mitglieder wollen Transparenz.
        Ein kleiner Klüngel will die Kasse. Niemand sagt, wer zur Satzung hält und wer den Dienstwagen bestellt.
      </p>
      <div className="home-grid">
        <form
          className="panel stack"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            void onCreate(name, timer, shuffle).finally(() => setBusy(false));
          }}
        >
          <h2>Verein gründen</h2>
          <label>
            Dein Name im Protokoll
            <input value={name} maxLength={20} required minLength={2} onChange={(event) => remember(event.target.value)} />
          </label>
          <label>
            Zugzeit
            <select value={timer} onChange={(event) => setTimer(Number(event.target.value))}>
              {TIMER_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {choice} Sekunden{choice === 90 ? " · Vorschlag" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={shuffle} onChange={(event) => setShuffle(event.target.checked)} />
            <span>Sitze mischen. Sonst gilt die Beitrittsreihenfolge, der Vorsitz wandert im Uhrzeigersinn.</span>
          </label>
          <button className="btn" type="submit" disabled={!connected || busy}>
            Vereinsheim öffnen
          </button>
        </form>
        <form
          className="panel stack"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            void onJoin(code, name).finally(() => setBusy(false));
          }}
        >
          <h2>Mit Code eintreten</h2>
          <label>
            Dein Name im Protokoll
            <input value={name} maxLength={20} required minLength={2} onChange={(event) => remember(event.target.value)} />
          </label>
          <label>
            Raumcode
            <input
              className="code-input"
              value={code}
              required
              minLength={4}
              maxLength={4}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="K7MP"
            />
          </label>
          <button className="btn brass" type="submit" disabled={!connected || busy}>
            Platz nehmen
          </button>
        </form>
      </div>
      <section className="rules">
        <h2>Satzung in Kurzform</h2>
        {RULES.map((rule) => (
          <details key={rule.heading}>
            <summary>{rule.heading}</summary>
            <p>{rule.body}</p>
          </details>
        ))}
      </section>
    </main>
  );
}
