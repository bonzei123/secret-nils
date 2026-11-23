import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { Ack, ClientAction, ClientState } from "@secret-nils/shared";

const STORAGE = "secret-nils-session";

interface Session {
  token: string;
  code: string;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.token || !parsed.code) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session: Session): void {
  localStorage.setItem(STORAGE, JSON.stringify(session));
}

function clearSession(): void {
  localStorage.removeItem(STORAGE);
}

export function useClub() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<ClientState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const socket = io({ autoConnect: true, reconnection: true });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      const session = loadSession();
      if (!session) {
        setBooting(false);
        return;
      }
      socket.emit("reconnect", { token: session.token }, (ack: Ack) => {
        setBooting(false);
        if (!ack.ok) {
          clearSession();
          setState(null);
          setError(ack.error ?? "Der Ausweis gilt nicht mehr.");
        }
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("state", (next: ClientState) => {
      setState(next);
      setBooting(false);
    });
    socket.on("kicked", (body: { message?: string }) => {
      clearSession();
      setState(null);
      setError(body.message ?? "Du bist draußen.");
    });
    socket.on("room_closed", (body: { message?: string }) => {
      clearSession();
      setState(null);
      setError(body.message ?? "Das Vereinsheim ist geschlossen.");
    });
    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, []);

  function emit(event: string, payload?: unknown): Promise<Ack> {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.resolve({ ok: false, error: "Keine Verbindung zum Vereinsheim." });
    return new Promise((resolve) => {
      socket.emit(event, payload ?? {}, (ack: Ack) => resolve(ack ?? { ok: false, error: "Keine Antwort." }));
    });
  }

  async function accept(ack: Ack): Promise<Ack> {
    if (!ack.ok) setError(ack.error ?? "Das hat nicht geklappt.");
    else setError(null);
    return ack;
  }

  return {
    connected,
    state,
    error,
    booting,
    dismissError: () => setError(null),
    async create(name: string, turnTimerSeconds: number, sitzeMischen: boolean, probeMitNpcs: boolean) {
      const ack = await accept(await emit("create", { name, turnTimerSeconds, sitzeMischen, probeMitNpcs }));
      if (ack.ok && ack.token && ack.code) saveSession({ token: ack.token, code: ack.code });
      return ack;
    },
    async join(code: string, name: string, watch = false) {
      const ack = await accept(await emit(watch ? "watch" : "join", { code, name }));
      if (ack.ok && ack.token && ack.code) saveSession({ token: ack.token, code: ack.code });
      return ack;
    },
    async ready(ready: boolean) {
      return accept(await emit("ready", { ready }));
    },
    async options(input: { turnTimerSeconds?: number; sitzeMischen?: boolean; probeMitNpcs?: boolean; zuschauer?: boolean }) {
      return accept(await emit("options", input));
    },
    async kick(playerId: string) {
      return accept(await emit("kick", { playerId }));
    },
    async start() {
      return accept(await emit("start"));
    },
    async rematch() {
      return accept(await emit("rematch"));
    },
    async leave() {
      const ack = await emit("leave", {});
      clearSession();
      setState(null);
      if (!ack.ok) setError(ack.error ?? "Verlassen hat nicht geklappt.");
      return ack;
    },
    async act(action: ClientAction) {
      return accept(await emit("action", action));
    },
  };
}
