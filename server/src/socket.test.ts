import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import type { Ack, ClientState } from "@secret-nils/shared";
import { createApp } from "./app.js";

function track(socket: Socket) {
  let current: ClientState | null = null;
  socket.on("state", (state: ClientState) => {
    current = state;
  });
  return {
    latest: () => current,
    async until(predicate: (state: ClientState) => boolean): Promise<ClientState> {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (current && predicate(current)) return current;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error("Kein passender Zustand vom Server.");
    },
  };
}

function ask(socket: Socket, event: string, payload?: unknown): Promise<Ack> {
  return new Promise((resolve) => {
    socket.emit(event, payload ?? {}, resolve);
  });
}

describe("Sockets", () => {
  const sockets: Socket[] = [];
  let closeServer: (() => Promise<void>) | null = null;

  afterEach(async () => {
    for (const socket of sockets) socket.disconnect();
    sockets.length = 0;
    if (closeServer) await closeServer();
    closeServer = null;
  });

  it("hält Rollen auf dem Server und lässt denselben Ausweis wieder zu", async () => {
    const app = createApp();
    await new Promise<void>((resolve) => app.httpServer.listen(0, "127.0.0.1", () => resolve()));
    const address = app.httpServer.address() as AddressInfo;
    closeServer = () =>
      new Promise((resolve) => {
        app.io.close();
        app.httpServer.close(() => resolve());
      });

    const health = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(await health.text()).toBe("ok");

    const connect = () =>
      new Promise<Socket>((resolve) => {
        const socket = ioClient(`http://127.0.0.1:${address.port}`, { transports: ["websocket"] });
        sockets.push(socket);
        socket.on("connect", () => resolve(socket));
      });

    const hostSocket = await connect();
    const hostState = track(hostSocket);
    const created = await ask(hostSocket, "create", { name: "Host", turnTimerSeconds: 90 });
    expect(created.ok).toBe(true);
    const code = created.code!;
    const token = created.token!;
    await hostState.until((state) => state.lobby.code === code);

    const others: { socket: Socket; token: string; id: string }[] = [];
    for (let index = 2; index <= 5; index += 1) {
      const socket = await connect();
      const state = track(socket);
      const joined = await ask(socket, "join", { code, name: `Gast ${index}` });
      expect(joined.ok).toBe(true);
      await state.until((entry) => entry.lobby.youId === joined.playerId);
      others.push({ socket, token: joined.token!, id: joined.playerId! });
    }

    for (const socket of [hostSocket, ...others.map((entry) => entry.socket)]) {
      const ready = await ask(socket, "ready", { ready: true });
      expect(ready.ok).toBe(true);
    }
    const started = await ask(hostSocket, "start", {});
    expect(started.ok).toBe(true);
    const playing = await hostState.until((state) => state.game?.phase === "briefing");
    expect(playing.game?.phase).toBe("briefing");

    const game = app.manager.debugGame(code);
    const liberal = game?.players.find((player) => player.role === "ehrliches_mitglied");
    if (!liberal) throw new Error("Kein ehrliches Mitglied");
    const secret = app.manager.viewFor(code, liberal.id);
    const json = JSON.stringify(secret);
    expect(json).not.toContain('"role":"nils"');
    expect(json).not.toContain('"role":"linientreuer"');
    expect(json).not.toContain(token);
    expect(json).not.toContain('"drawPile"');
    expect(secret?.game?.phase).toBe("briefing");

    const dropped = others[0]!;
    await new Promise<void>((resolve) => {
      dropped.socket.once("disconnect", () => resolve());
      dropped.socket.disconnect();
    });
    const returned = await connect();
    const returnedState = track(returned);
    const back = await ask(returned, "reconnect", { token: dropped.token });
    expect(back.ok).toBe(true);
    expect(back.playerId).toBe(dropped.id);
    const restored = await returnedState.until((state) => state.game?.you.id === dropped.id);
    expect(restored.game?.you.id).toBe(dropped.id);
    expect(restored.game?.you.role).toBe(game?.players.find((player) => player.id === dropped.id)?.role);
    expect(restored.lobby.players.find((player) => player.id === dropped.id)?.connected).toBe(true);
  });
});
