import { Game } from "./Game";
import { Home } from "./Home";
import { Lobby } from "./Lobby";
import { Logo } from "./ui";
import { useClub } from "./useClub";

export function App() {
  const club = useClub();
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
              <h1>Der Ausweis wird geprüft</h1>
            </div>
          </header>
          <p>Gleich geht die Tür zum Vereinsheim auf.</p>
        </main>
      )}
      {screen === "home" && <Home connected={club.connected} onCreate={club.create} onJoin={club.join} />}
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
        <p className="colophon">
          Fiktives Partyspiel ohne Bezug zu echten Clubs, Personen oder Organisationen. Eigenständige Satire, keine
          offizielle Adaption.
        </p>
      )}
    </div>
  );
}
