import { useEffect, useState } from "react";
import { Game } from "./Game";
import { Home } from "./Home";
import { Lobby } from "./Lobby";
import { Policies } from "./Policies";
import { Logo, Wordmark } from "./ui";
import { useClub } from "./useClub";

export function App() {
  const club = useClub();
  const [policiesOpen, setPoliciesOpen] = useState(() => window.location.hash === "#satzung");
  useEffect(() => {
    const sync = () => setPoliciesOpen(window.location.hash === "#satzung");
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const screen = club.booting ? "boot" : !club.state ? "home" : club.state.game ? "game" : "lobby";

  return (
    <div className="felt">
      {club.error && (
        <div className="toast" role="alert">
          <p>{club.error}</p>
          <button type="button" className="btn secondary" onClick={club.dismissError}>
            Schließen
          </button>
        </div>
      )}
      {screen === "boot" && (
        <main className="center-card">
          <header className="masthead">
            <Logo />
            <div>
              <p className="kicker">Verbindung</p>
              <h1>
                <Wordmark>Der Ausweis wird geprüft</Wordmark>
              </h1>
            </div>
          </header>
          <p>Gleich geht die Tür zum Vereinsheim auf.</p>
        </main>
      )}
      {screen === "home" && policiesOpen && (
        <Policies
          onBack={() => {
            if (window.location.hash === "#satzung") history.replaceState(null, "", window.location.pathname + window.location.search);
            setPoliciesOpen(false);
          }}
        />
      )}
      {screen === "home" && !policiesOpen && <Home connected={club.connected} onCreate={club.create} onJoin={club.join} />}
      {screen === "lobby" && club.state && (
        <Lobby
          state={club.state}
          onReady={club.ready}
          onOptions={club.options}
          onKick={club.kick}
          onStart={club.start}
          onLeave={club.leave}
        />
      )}
      {screen === "game" && club.state && (
        <Game state={club.state} connected={club.connected} onAct={club.act} onRematch={club.rematch} onLeave={club.leave} />
      )}
      {screen !== "game" && (
        <footer className="colophon">
          <p>Fiktives Partyspiel ohne Bezug zu echten Clubs, Personen oder Organisationen. Eigenständige Satire, keine offizielle Adaption.</p>
          {screen === "home" && !policiesOpen && (
            <button type="button" className="colophon-link" onClick={() => { window.location.hash = "satzung"; }}>
              Beschlussvorlagen
            </button>
          )}
        </footer>
      )}
    </div>
  );
}
