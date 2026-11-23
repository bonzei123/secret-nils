import { useEffect, useState } from "react";
import { RULES, SEAT_COLORS, type ClientAction, type ClientState, type PolicyView } from "@secret-nils/shared";
import { ProtokollSheet } from "./Protokoll";
import { Leaf, Logo, SecretCover, Wordmark, formatClock, useCountdown } from "./ui";

interface GameProps {
  state: ClientState;
  connected: boolean;
  onAct: (action: ClientAction) => Promise<unknown>;
  onRematch: () => Promise<unknown>;
  onLeave: () => Promise<unknown>;
  onOptions: (input: { zuschauer?: boolean }) => Promise<unknown>;
}

export function Game({ state, connected, onAct, onRematch, onLeave, onOptions }: GameProps) {
  const game = state.game;
  if (!game) return null;
  return <Table state={state} game={game} connected={connected} onAct={onAct} onRematch={onRematch} onLeave={onLeave} onOptions={onOptions} />;
}

function Table({
  state,
  game,
  connected,
  onAct,
  onRematch,
  onLeave,
  onOptions,
}: GameProps & { game: NonNullable<ClientState["game"]> }) {
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const seconds = useCountdown(game.turnSecondsLeft);
  const isHost = state.lobby.youId === state.lobby.hostId;

  useEffect(() => {
    setArmed(null);
  }, [game.phase, game.pendingPower, game.offices.presidentName]);

  useEffect(() => {
    if (game.youMustAct && game.phase !== "briefing") navigator.vibrate?.(12);
  }, [game.youMustAct, game.phase, game.pendingPower, game.offices.presidentName]);

  async function run(action: ClientAction) {
    setBusy(true);
    try {
      await onAct(action);
    } finally {
      setBusy(false);
    }
  }

  const blocked = [game.offices.blockedChancellorName && `Kasse: ${game.offices.blockedChancellorName}`, game.offices.blockedPresidentName && `Vorsitz: ${game.offices.blockedPresidentName}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="table on-felt">
      <header className="mast">
        <div className="masthead" style={{ margin: 0 }}>
          <Logo />
          <div>
            <p className="kicker" style={{ color: "var(--brass)" }}>
              {state.lobby.code}
            </p>
            <p className="brand-name">
              <Wordmark tone="club">Secret Nils</Wordmark>
            </p>
          </div>
        </div>
        <div role="status" className="phase-pill">
          {game.phaseLabel}
        </div>
        <div className={`timer ${seconds !== null && seconds <= 10 ? "hot" : ""}`}>{formatClock(seconds)}</div>
        <div className="btn-row">
          <button type="button" className="btn brass" onClick={() => setSecret(true)}>
            Ausweis{game.notes.length > 0 ? ` · ${game.notes.length}` : ""}
          </button>
          <button type="button" className="btn secondary" onClick={() => void onLeave()}>
            Trennen
          </button>
        </div>
      </header>
      {!connected && <p className="conn-warn">Verbindung weg. Der Ausweis bleibt auf diesem Gerät gültig.</p>}
      {!game.you.alive && game.phase !== "game_over" && (
        <p className="note-warn">Du wurdest nicht entlastet. Du schaust zu, stimmst aber nicht mehr ab.</p>
      )}
      {isHost && (
        <label className="check tribune-toggle">
          <input
            type="checkbox"
            checked={Boolean(state.lobby.options.zuschauer)}
            onChange={(event) => void onOptions({ zuschauer: event.target.checked })}
          />
          <span>Zuschauer ohne Sitz zulassen</span>
        </label>
      )}
      {state.lobby.spectators.length > 0 && (
        <p className="meta-line">Tribüne: {state.lobby.spectators.map((spectator) => spectator.name).join(", ")}</p>
      )}

      <div className="table-grid">
        <section className="board">
          <div className="offices">
            <div className="office">
              <span>1. Vorsitz</span>
              <strong>{game.offices.presidentName}</strong>
            </div>
            <div className="office">
              <span>{game.offices.nomineeName ? "Vorschlag Kasse" : "Kassenwart"}</span>
              <strong>{game.offices.chancellorName ?? game.offices.nomineeName ?? "—"}</strong>
            </div>
            <div className="office">
              <span>Amtsperre</span>
              <strong>{blocked || "—"}</strong>
            </div>
          </div>
          <div className="tracks">
            <Track
              title="Vereinswohl"
              goal={game.vereinswohlGoal}
              tone="verein"
              slots={Array.from({ length: 5 }, (_, index) => (index === 4 ? "Verein gewinnt" : "—"))}
              enacted={game.vereinswohl}
            />
            <Track
              title="Eigeninteresse"
              goal={game.eigeninteresseGoal}
              tone="eigen"
              slots={[...game.board.map((slot) => slot.label), "Klüngel übernimmt"]}
              enacted={game.eigeninteresse}
            />
          </div>
          <div className="tracker" style={{ marginTop: "0.8rem" }}>
            <span>Notverwaltung</span>
            {[0, 1, 2].map((index) => (
              <div key={index} className={`wax ${index < game.electionTracker ? "on" : ""}`}>
                {index < game.electionTracker ? "Nein" : ""}
              </div>
            ))}
            {game.vetoUnlocked && <span className="badge bad">Formfehler möglich</span>}
          </div>
          <p className="meta-line">
            Stapel {game.drawCount} · Reißwolf {game.discardCount}
            {game.lastElection ? ` · letzte Wahl ${game.lastElection.ja} : ${game.lastElection.nein}` : ""}
          </p>
          {game.specialElectionNote && <p className="note-warn">{game.specialElectionNote}</p>}
          <p className="meta-line">{game.composition}. {game.livingCount} noch stimmberechtigt.</p>
        </section>
        <aside>
          <section className="side-card">
            <h2>Versammlung</h2>
            <ul className="people">
              {game.players.map((player) => (
                <li key={player.id} className={`person ${player.alive ? "" : "out"}`}>
                  <span className="pip" style={{ background: SEAT_COLORS[player.seat % SEAT_COLORS.length] }} />
                  <div>
                    <div className="person-name">{player.name}</div>
                    <div className="badges">
                      {player.isYou && <span className="badge">Du</span>}
                      {player.npc && <span className="badge">Platzhalter</span>}
                      {player.isPresident && <span className="badge warn">Vorsitz</span>}
                      {player.isChancellor && <span className="badge warn">Kasse</span>}
                      {player.isNominee && <span className="badge warn">Vorschlag</span>}
                      {player.termLimited && <span className="badge">Amtsperre</span>}
                      {!player.alive && <span className="badge bad">ausgeschlossen</span>}
                      {!player.connected && player.alive && <span className="badge">getrennt</span>}
                      {player.voted && <span className="badge good">Karte liegt</span>}
                      {player.ballot === "zustimmen" && <span className="badge good">Ja</span>}
                      {player.ballot === "ablehnen" && <span className="badge bad">Nein</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="protocol" aria-live="polite">
            <h2>Sitzungsprotokoll</h2>
            <ol>
              {game.log.map((entry) => (
                <li key={entry.id} className={`log-${entry.tone}`}>
                  {entry.text}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <section className={`dock ${game.youMustAct ? "live" : ""}`}>
        <h2>{game.phase === "game_over" ? game.winTitle : game.phaseLabel}</h2>
        <p className="instruction">{game.instruction}</p>
        {game.vetoUnlocked && game.electionTracker === 2 && (game.phase === "legislative_chancellor" || game.phase === "veto_request") && (
          <p className="note-warn">Der Tracker steht auf 2. Eine anerkannte Formfehler-Rüge löst die Notverwaltung aus.</p>
        )}
        {game.phase === "briefing" && (
          <div className="stack">
            <RoleCard game={game} />
            <button type="button" className="btn" disabled={busy || game.you.acknowledged} onClick={() => void run({ type: "ack_briefing" })}>
              {game.you.acknowledged ? "Abgehakt" : "Im Protokoll abhaken"}
            </button>
            {game.briefing && (
              <p className="meta-line">
                {game.briefing.ready}/{game.briefing.total} Ausweise gelesen
              </p>
            )}
          </div>
        )}
        {game.phase === "nominating" && game.youMustAct && (
          <div className="choice-grid">
            {game.players
              .filter((player) => player.alive && !player.isYou)
              .map((player) => {
                const allowed = game.eligibleChancellorIds.includes(player.id);
                return (
                  <button
                    key={player.id}
                    type="button"
                    className="btn secondary"
                    disabled={!allowed || busy}
                    onClick={() => void run({ type: "nominate", chancellorId: player.id })}
                  >
                    {player.name}
                    {!allowed ? " · nicht wählbar" : " als Kasse"}
                  </button>
                );
              })}
          </div>
        )}
        {game.phase === "voting" && game.youMustAct && (
          <div className="vote-row">
            <button type="button" className="btn" disabled={busy} onClick={() => void run({ type: "vote", ballot: "zustimmen" })}>
              Zustimmen
            </button>
            <button type="button" className="btn danger" disabled={busy} onClick={() => void run({ type: "vote", ballot: "ablehnen" })}>
              Ablehnen
            </button>
          </div>
        )}
        {(game.phase === "legislative_president" || game.phase === "legislative_chancellor" || game.phase === "veto_request") && (
          <Hand game={game} busy={busy} onDiscard={(policyId) => void run({ type: "discard", policyId })} onEnact={(policyId) => void run({ type: "enact", policyId })} />
        )}
        {game.canRequestVeto && (
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void run({ type: "request_veto" })}>
            Beide als Formfehler rügen
          </button>
        )}
        {game.phase === "veto_request" && game.youMustAct && (
          <div className="vote-row">
            <button type="button" className="btn danger" disabled={busy} onClick={() => void run({ type: "resolve_veto", accept: true })}>
              Rüge anerkennen
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void run({ type: "resolve_veto", accept: false })}>
              Zurückweisen
            </button>
          </div>
        )}
        {game.phase === "executive" && game.peek && (
          <div className="stack">
            <SecretCover label="Tagesordnung lesen">
              <div className="hand">
                {game.peek.map((card) => (
                  <PolicyCard key={card.id} card={card} />
                ))}
              </div>
            </SecretCover>
            {game.youMustAct && (
              <button type="button" className="btn" disabled={busy} onClick={() => void run({ type: "ack_peek" })}>
                Gelesen, Mappe zu
              </button>
            )}
          </div>
        )}
        {game.phase === "executive" && game.youMustAct && game.pendingPower && game.pendingPower !== "tagesordnung" && (
          <div className="stack">
            {game.pendingPowerHint && <p className="meta-line">{game.pendingPowerHint}</p>}
            <div className="choice-grid">
              {game.players
                .filter((player) => game.executiveTargetIds.includes(player.id))
                .map((player) => {
                  const armedThis = armed === player.id;
                  const label =
                    game.pendingPower === "nicht_entlastung"
                      ? armedThis
                        ? `${player.name} jetzt nicht entlasten`
                        : `${player.name} auswählen`
                      : game.pendingPower === "kassenpruefung"
                        ? `Akte von ${player.name}`
                        : `${player.name} beruft die Sondersitzung`;
                  return (
                    <button
                      key={player.id}
                      type="button"
                      className={game.pendingPower === "nicht_entlastung" ? "btn danger" : "btn secondary"}
                      disabled={busy}
                      onClick={() => {
                        if (game.pendingPower === "kassenpruefung") void run({ type: "investigate", targetId: player.id });
                        else if (game.pendingPower === "sondersitzung") void run({ type: "special_election", targetId: player.id });
                        else if (!armedThis) setArmed(player.id);
                        else void run({ type: "exclude", targetId: player.id });
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
            </div>
          </div>
        )}
        {game.phase === "game_over" && (
          <div className="win">
            <span className={`role-stamp ${game.winner === "verein" ? "verein" : ""}`}>{game.winStamp}</span>
            <p>{game.winBody}</p>
            {game.protokoll ? (
              <ProtokollSheet protokoll={game.protokoll} />
            ) : (
              <ul className="reveal">
                {game.revealed?.map((player) => (
                  <li key={player.id} className={player.role === "ehrliches_mitglied" ? "verein" : "kluengel"}>
                    <strong>{player.name}</strong>
                    <span>
                      {player.roleTitle}
                      {!player.alive ? " · ausgeschlossen" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {isHost ? (
              <button type="button" className="btn brass" onClick={() => void onRematch()}>
                Neue Sitzung im selben Vereinsheim
              </button>
            ) : (
              <p className="meta-line">Der Vorstand kann eine neue Sitzung aufsetzen.</p>
            )}
          </div>
        )}
      </section>

      {secret && (
        <div className="overlay" onClick={() => setSecret(false)}>
          <div className="paper overlay-card" onClick={(event) => event.stopPropagation()}>
            <div className="btn-row" style={{ justifyContent: "space-between" }}>
              <h2 style={{ fontFamily: "Fraunces, Georgia, serif", margin: 0 }}>Nur für dich</h2>
              <button type="button" className="btn secondary" onClick={() => setSecret(false)}>
                Schließen
              </button>
            </div>
            <RoleCard game={game} />
            {game.notes.length > 0 && (
              <div>
                <h3>Vertrauliche Notizen</h3>
                <ul className="allies">
                  {game.notes.map((note) => (
                    <li key={note.id}>{note.text}</li>
                  ))}
                </ul>
              </div>
            )}
            <details className="rules">
              <summary>Satzung</summary>
              {RULES.map((rule) => (
                <p key={rule.heading}>
                  <strong>{rule.heading}. </strong>
                  {rule.body}
                </p>
              ))}
            </details>
          </div>
        </div>
      )}
    </div>
  );
}

function RoleCard({ game }: { game: NonNullable<ClientState["game"]> }) {
  return (
    <SecretCover label="Ausweis zeigen">
      <article className="ausweis">
        <p className="kicker">Mitgliedsausweis</p>
        <h3>{game.you.name}</h3>
        <span className={`role-stamp ${game.you.role === "ehrliches_mitglied" ? "verein" : ""}`}>{game.you.roleTitle}</span>
        <p>{game.you.brief}</p>
        {game.allies.length > 0 ? (
          <ul className="allies">
            {game.allies.map((ally) => (
              <li key={ally.id}>
                {ally.name} — {ally.role === "nils" ? "Nils" : "linientreuer Festangestellter"}
              </li>
            ))}
          </ul>
        ) : (
          <p>{game.you.role === "nils" && !game.nilsSeesStaff ? "Du kennst deine Festangestellten in dieser Runde nicht." : "Du kennst niemanden sonst."}</p>
        )}
      </article>
    </SecretCover>
  );
}

const SHORT_SLOT: Record<string, string> = {
  "—": "—",
  Kassenprüfung: "Prüfung",
  Sondersitzung: "Sonder",
  Tagesordnung: "Einblick",
  "Nicht-Entlastung": "JHV",
  "Klüngel übernimmt": "Sieg",
  "Verein gewinnt": "Sieg",
};

function Track({
  title,
  goal,
  tone,
  slots,
  enacted,
}: {
  title: string;
  goal: number;
  tone: string;
  slots: string[];
  enacted: { id: string; title: string; chaos: boolean; power: string | null }[];
}) {
  return (
    <section className={`track ${tone}`}>
      <div className="track-head">
        <h2>
          <Leaf tone={tone === "eigen" ? "bad" : "good"} />
          {title}
        </h2>
        <span>
          {enacted.length}/{goal}
        </span>
      </div>
      <div className="slot-row">
        {slots.map((label, index) => {
          const card = enacted[index];
          const short = SHORT_SLOT[label] ?? label;
          return (
            <div key={`${title}-${index}`} className={`slot ${card ? "filled" : ""} ${tone === "eigen" ? "eigen" : ""}`} title={label}>
              <span className="no">
                <Leaf tone={tone === "eigen" ? "bad" : "good"} />
                {index + 1}
              </span>
              {card ? <strong title={card.title}>{card.title}</strong> : <em>{short}</em>}
              {card?.chaos && <span className="mini-stamp">Notverwaltung</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PolicyCard({ card, action }: { card: PolicyView; action?: string }) {
  const good = card.type === "vereinswohl";
  return (
    <>
      <span className="antrag-mark">
        <Leaf tone={good ? "good" : "bad"} />
      </span>
      <span className="kicker">{good ? "Vereinswohl" : "Eigeninteresse"}</span>
      <h3>{card.title}</h3>
      <p>{card.flavor}</p>
      {action && <span className="antrag-action">{action}</span>}
    </>
  );
}

function Hand({
  game,
  busy,
  onDiscard,
  onEnact,
}: {
  game: NonNullable<ClientState["game"]>;
  busy: boolean;
  onDiscard: (id: string) => void;
  onEnact: (id: string) => void;
}) {
  if (!game.hand) {
    const count = game.phase === "legislative_president" ? 3 : 2;
    return (
      <div className="backs" aria-hidden>
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="card-back">
            <Leaf tone="club" />
          </div>
        ))}
      </div>
    );
  }
  const actionable = game.handPurpose === "verwerfen" || game.handPurpose === "beschliessen";
  return (
    <div className="hand">
      {game.hand.map((card) => {
        const action = game.handPurpose === "verwerfen" ? "In den Reißwolf" : game.handPurpose === "beschliessen" ? "Beschließen" : undefined;
        if (!actionable) {
          return (
            <article key={card.id} className={`antrag ${card.type}`}>
              <PolicyCard card={card} />
            </article>
          );
        }
        return (
          <button
            key={card.id}
            type="button"
            className={`antrag ${card.type}`}
            disabled={busy}
            onClick={() => (game.handPurpose === "verwerfen" ? onDiscard(card.id) : onEnact(card.id))}
          >
            <PolicyCard card={card} action={action} />
          </button>
        );
      })}
    </div>
  );
}
