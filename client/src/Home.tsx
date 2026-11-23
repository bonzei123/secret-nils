import { useMemo, useState } from "react";
import { HOW_TO_EXTRAS, HOW_TO_STEPS, HOW_TO_TURNS, HOW_TO_WINS, RULES, TIMER_CHOICES } from "@secret-nils/shared";
import { Logo, Wordmark } from "./ui";

interface HomeProps {
  connected: boolean;
  onCreate: (name: string, timer: number, shuffle: boolean, probe: boolean) => Promise<unknown>;
  onJoin: (code: string, name: string, watch: boolean) => Promise<unknown>;
}

export function Home({ connected, onCreate, onJoin }: HomeProps) {
  const preset = useMemo(() => new URLSearchParams(window.location.search).get("beitritt") ?? "", []);
  const [name, setName] = useState(() => localStorage.getItem("secret-nils-name") ?? "");
  const [code, setCode] = useState(preset);
  const [timer, setTimer] = useState<number>(90);
  const [shuffle, setShuffle] = useState(false);
  const [probe, setProbe] = useState(false);
  const [watchOnly, setWatchOnly] = useState(false);
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
          <h1>
            <Wordmark>Secret Nils</Wordmark>
          </h1>
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
            void onCreate(name, timer, shuffle, probe).finally(() => setBusy(false));
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
          <label className="check">
            <input type="checkbox" checked={probe} onChange={(event) => setProbe(event.target.checked)} />
            <span>
              <strong>Probespiel.</strong> Nur wenn dieser Haken gesetzt ist, füllen Platzhalter auf fünf Sitze auf.
            </span>
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
            void onJoin(code, name, watchOnly).finally(() => setBusy(false));
          }}
        >
          <h2>Mit Code eintreten</h2>
          {preset && <p className="meta-line">Einladung für Raum {preset}. Name eintragen, dann Platz nehmen oder nur zuschauen.</p>}
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
          <label className="check">
            <input type="checkbox" checked={watchOnly} onChange={(event) => setWatchOnly(event.target.checked)} />
            <span>Nur zuschauen, ohne Sitz. Geht nur, wenn der Vorstand die Tribüne geöffnet hat.</span>
          </label>
          <button className="btn brass" type="submit" disabled={!connected || busy}>
            {watchOnly ? "Auf die Tribüne" : "Platz nehmen"}
          </button>
        </form>
      </div>
      <details className="howto">
        <summary>So läuft ein Zug</summary>
        <p className="howto-lead">
          Ihr müsst nichts auswendig können. Wenn ihr dran seid, sagt der Bildschirm, welcher Knopf als Nächstes kommt. Das hier ist die Reihenfolge.
        </p>
        <ol className="howto-steps">
          {HOW_TO_STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="num">{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="howto-grid">
          <article className="panel">
            <h2>Wenn du dran bist</h2>
            <ul className="howto-list">
              {HOW_TO_TURNS.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}. </strong>
                  {item.body}
                </li>
              ))}
            </ul>
          </article>
          <article className="panel">
            <h2>Wer gewinnt</h2>
            <ul className="howto-list">
              {HOW_TO_WINS.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}. </strong>
                  {item.body}
                </li>
              ))}
            </ul>
          </article>
        </div>
        <div className="howto-grid">
          {HOW_TO_EXTRAS.map((item) => (
            <article key={item.title} className="panel">
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </details>
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
