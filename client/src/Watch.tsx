import type { ClientState } from "@secret-nils/shared";
import { ProtokollSheet } from "./Protokoll";
import { Logo, Wordmark, formatClock, useCountdown } from "./ui";

interface WatchProps {
  state: ClientState;
  onLeave: () => Promise<unknown>;
}

export function Watch({ state, onLeave }: WatchProps) {
  const watch = state.watch;
  if (!watch) return null;
  const seconds = useCountdown(watch.turnSecondsLeft);
  return (
    <div className="table on-felt">
      <header className="mast">
        <div className="masthead" style={{ margin: 0 }}>
          <Logo />
          <div>
            <p className="kicker" style={{ color: "var(--brass)" }}>
              Tribüne · {state.lobby.code}
            </p>
            <p className="brand-name">
              <Wordmark tone="club">Secret Nils</Wordmark>
            </p>
          </div>
        </div>
        <div role="status" className="phase-pill">
          {watch.phaseLabel}
        </div>
        <div className={`timer ${seconds !== null && seconds <= 10 ? "hot" : ""}`}>{formatClock(seconds)}</div>
        <button type="button" className="btn secondary" onClick={() => void onLeave()}>
          Gehen
        </button>
      </header>
      <p className="note-warn">Du sitzt nicht mit, {watch.youName}. Rollen, Karten und Stimmen bleiben verdeckt, bis die Sitzung vorbei ist.</p>
      <div className="table-grid">
        <section className="board">
          <p className="instruction">{watch.instruction}</p>
          <p className="meta-line">
            Vorsitz {watch.offices.presidentName}
            {watch.offices.chancellorName ? ` · Kasse ${watch.offices.chancellorName}` : ""}
            {watch.offices.nomineeName ? ` · Vorschlag ${watch.offices.nomineeName}` : ""}
          </p>
          <ul className="people">
            {watch.players.map((player) => (
              <li key={player.id} className={`person ${player.alive ? "" : "out"}`}>
                <div>
                  <div className="person-name">{player.name}</div>
                  <div className="badges">
                    {player.npc && <span className="badge">Platzhalter</span>}
                    {player.isPresident && <span className="badge warn">Vorsitz</span>}
                    {player.isChancellor && <span className="badge warn">Kasse</span>}
                    {player.isNominee && <span className="badge warn">Vorschlag</span>}
                    {!player.alive && <span className="badge bad">raus</span>}
                    {player.alive && <span className="badge good">drin</span>}
                    {player.voted && <span className="badge">Karte liegt</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="sheet-grid">
            <section>
              <h3>Vereinswohl</h3>
              <ul>
                {watch.vereinswohl.map((card) => (
                  <li key={card.id}>{card.title}</li>
                ))}
                {watch.vereinswohl.length === 0 && <li>Noch keiner.</li>}
              </ul>
            </section>
            <section>
              <h3>Eigeninteresse</h3>
              <ul>
                {watch.eigeninteresse.map((card) => (
                  <li key={card.id}>{card.title}</li>
                ))}
                {watch.eigeninteresse.length === 0 && <li>Noch keiner.</li>}
              </ul>
            </section>
          </div>
        </section>
        <aside>
          <section className="protocol" aria-live="polite">
            <h2>Sitzungsprotokoll</h2>
            <ol>
              {watch.log.map((entry) => (
                <li key={entry.id} className={`log-${entry.tone}`}>
                  {entry.text}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
      {watch.protokoll && (
        <section className="dock">
          <ProtokollSheet protokoll={watch.protokoll} />
        </section>
      )}
    </div>
  );
}
