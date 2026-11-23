import { useState } from "react";
import type { ClientState, TimerChoice } from "@secret-nils/shared";
import { Logo, Wordmark } from "./ui";

interface LobbyProps {
  state: ClientState;
  onReady: (ready: boolean) => Promise<unknown>;
  onOptions: (input: { turnTimerSeconds?: number; sitzeMischen?: boolean; probeMitNpcs?: boolean }) => Promise<unknown>;
  onKick: (playerId: string) => Promise<unknown>;
  onStart: () => Promise<unknown>;
  onLeave: () => Promise<unknown>;
}

export function Lobby({ state, onReady, onOptions, onKick, onStart, onLeave }: LobbyProps) {
  const { lobby } = state;
  const you = lobby.players.find((player) => player.isYou);
  const isHost = lobby.youId === lobby.hostId;
  const [copied, setCopied] = useState("");
  const link = `${window.location.origin}/?beitritt=${lobby.code}`;

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied("Kopieren hat der Browser blockiert.");
    }
  }

  return (
    <main className="paper lobby">
      <header className="masthead">
        <Logo />
        <div>
          <p className="kicker">Vereinsheim</p>
          <h1>
            <Wordmark>Warteraum</Wordmark>
          </h1>
        </div>
      </header>
      <div className="code-plate">
        <div>
          <p className="kicker">Raumcode</p>
          <strong>{lobby.code}</strong>
        </div>
        <div className="btn-row">
          <button type="button" className="btn secondary" onClick={() => void copy(lobby.code, "Code kopiert")}>
            Code kopieren
          </button>
          <button type="button" className="btn secondary" onClick={() => void copy(link, "Link kopiert")}>
            Einladungslink
          </button>
          <button type="button" className="btn ghost" onClick={() => void onLeave()}>
            Verlassen
          </button>
        </div>
      </div>
      {copied && <p className="meta-line">{copied}</p>}
      <section className="panel probe-box">
        <label className="check">
          <input
            type="checkbox"
            disabled={!isHost}
            checked={Boolean(lobby.options.probeMitNpcs)}
            onChange={(event) => void onOptions({ probeMitNpcs: event.target.checked })}
          />
          <span>
            <strong>Probespiel.</strong> Nur angehakt werden Platzhalter dazugesetzt, bis fünf Sitze voll sind. Ohne Haken braucht es fünf Personen.
          </span>
        </label>
      </section>
      <div className="split" style={{ marginTop: "1rem" }}>
        <section className="panel">
          <h2>Mitgliederliste</h2>
          <ul className="member-list">
            {lobby.players.map((player) => (
              <li key={player.id} className="member">
                <div>
                  <strong>{player.name}</strong>
                  <div className="badges">
                    {player.isYou && <span className="badge">Du</span>}
                    {player.isHost && <span className="badge warn">Vorstand</span>}
                    <span className={`badge ${player.ready ? "good" : ""}`}>{player.ready ? "bereit" : "wartet"}</span>
                    {!player.connected && <span className="badge bad">getrennt</span>}
                  </div>
                </div>
                {isHost && !player.isYou && (
                  <button type="button" className="btn danger" onClick={() => void onKick(player.id)}>
                    Bitten zu gehen
                  </button>
                )}
              </li>
            ))}
            {(lobby.npcFillers ?? []).map((name) => (
              <li key={name} className="member">
                <div>
                  <strong>{name}</strong>
                  <div className="badges">
                    <span className="badge">Platzhalter</span>
                    <span className="badge good">setzt sich beim Start</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="btn-row" style={{ marginTop: "0.8rem" }}>
            <button type="button" className="btn" onClick={() => void onReady(!you?.ready)}>
              {you?.ready ? "Doch nicht bereit" : "Ich bin bereit"}
            </button>
          </div>
        </section>
        <section className="panel stack">
          <h2>Hausordnung</h2>
          <label>
            Zugzeit
            <select
              disabled={!isHost}
              value={lobby.options.turnTimerSeconds}
              onChange={(event) => void onOptions({ turnTimerSeconds: Number(event.target.value) as TimerChoice })}
            >
              {lobby.timerChoices.map((choice) => (
                <option key={choice} value={choice}>
                  {choice} Sekunden
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              disabled={!isHost}
              checked={lobby.options.sitzeMischen}
              onChange={(event) => void onOptions({ sitzeMischen: event.target.checked })}
            />
            <span>Sitze zu Beginn mischen.</span>
          </label>
          <p className="meta-line">
            {lobby.options.probeMitNpcs
              ? (lobby.npcFillers ?? []).length > 0
                ? `${lobby.players.length} Personen, dazu ${(lobby.npcFillers ?? []).length} Platzhalter bis fünf Sitze. Alle echten Mitglieder bereit und verbunden.`
                : `${lobby.players.length}/10 Mitglieder. Genug Personen, die Platzhalter bleiben draußen.`
              : `${lobby.players.length}/10 Mitglieder. Es braucht 5 bis 10, alle bereit und verbunden.`}
          </p>
          {isHost ? (
            <>
              <button type="button" className="btn brass" disabled={!lobby.canStart} onClick={() => void onStart()}>
                Sitzung eröffnen
              </button>
              {lobby.blockReason && <p className="meta-line">{lobby.blockReason}</p>}
            </>
          ) : (
            <p className="meta-line">Der Vorstand eröffnet die Sitzung, sobald alle bereit sind.</p>
          )}
        </section>
      </div>
    </main>
  );
}
