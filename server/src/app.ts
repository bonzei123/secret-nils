import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { Server } from "socket.io";
import type { Ack, ClientState } from "@secret-nils/shared";
import { RoomManager, type ManagerConfig } from "./manager.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

function clientDist(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "client/dist"),
    path.resolve(process.cwd(), "../client/dist"),
  ];
  return candidates.find((candidate) => existsSync(path.join(candidate, "index.html"))) ?? null;
}

function sendFile(res: ServerResponse, filePath: string): void {
  const extension = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[extension] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

function handleHttp(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }
  const dist = clientDist();
  if (!dist) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Secret Nils Server läuft. Im Entwicklungsmodus liefert Vite die Oberfläche.");
    return;
  }
  const root = path.resolve(dist);
  const requested = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
  const inside = requested === root || requested.startsWith(`${root}${path.sep}`);
  const file = inside && existsSync(requested) && statSync(requested).isFile() ? requested : path.join(root, "index.html");
  sendFile(res, file);
}

interface BoundSocket {
  data: { roomCode?: string; playerId?: string };
  id: string;
  join: (room: string) => void;
  leave: (room: string) => void;
  emit: (event: string, payload?: unknown) => void;
  disconnect: (close?: boolean) => void;
}

function reply(ack: unknown, body: Ack): void {
  if (typeof ack === "function") (ack as (value: Ack) => void)(body);
}

export function createApp(config: ManagerConfig = {}) {
  const httpServer = createServer(handleHttp);
  const io = new Server(httpServer, {
    cors: { origin: true },
    pingInterval: 10_000,
    pingTimeout: 25_000,
  });

  let manager!: RoomManager;
  const broadcast = (code: string) => {
    for (const member of manager.memberSocketIds(code)) {
      if (!member.socketId) continue;
      const sock = io.sockets.sockets.get(member.socketId);
      const state: ClientState | null = manager.viewFor(code, member.id);
      if (sock && state) sock.emit("state", state);
    }
  };
  const closeRoom = (code: string, socketIds: string[]) => {
    for (const socketId of socketIds) {
      const sock = io.sockets.sockets.get(socketId);
      sock?.emit("room_closed", { message: "Das Vereinsheim ist geschlossen." });
      sock?.leave(code);
    }
  };

  manager = new RoomManager({ ...config, onChange: broadcast, onClose: closeRoom });

  const bind = (socket: BoundSocket, code: string, playerId: string) => {
    if (socket.data.roomCode && socket.data.roomCode !== code) {
      socket.leave(socket.data.roomCode);
    }
    socket.data.roomCode = code;
    socket.data.playerId = playerId;
    socket.join(code);
    const replaced = manager.attach(code, playerId, socket.id);
    if (replaced) {
      const previous = io.sockets.sockets.get(replaced);
      previous?.emit("kicked", { message: "Dein Ausweis wird in einem anderen Tab benutzt." });
      previous?.disconnect(true);
    }
    broadcast(code);
  };

  io.on("connection", (socket) => {
    socket.on("create", (payload: unknown, ack?: unknown) => {
      const body = (payload ?? {}) as { name?: unknown; turnTimerSeconds?: unknown; sitzeMischen?: unknown };
      const result = manager.createRoom(body);
      if (!result.ok) return reply(ack, result);
      bind(socket, result.data.code, result.data.playerId);
      reply(ack, { ok: true, ...result.data });
    });

    socket.on("join", (payload: unknown, ack?: unknown) => {
      const body = (payload ?? {}) as { code?: unknown; name?: unknown };
      const result = manager.joinRoom(body.code, body.name);
      if (!result.ok) return reply(ack, result);
      bind(socket, result.data.code, result.data.playerId);
      reply(ack, { ok: true, ...result.data });
    });

    socket.on("reconnect", (payload: unknown, ack?: unknown) => {
      const token = (payload as { token?: unknown } | null)?.token;
      const result = manager.reconnect(token);
      if (!result.ok) return reply(ack, result);
      bind(socket, result.data.code, result.data.playerId);
      reply(ack, { ok: true, code: result.data.code, playerId: result.data.playerId });
    });

    socket.on("ready", (payload: unknown, ack?: unknown) => {
      const located = current(socket);
      if (!located) return reply(ack, { ok: false, error: "Du bist in keinem Vereinsheim." });
      const ready = (payload as { ready?: unknown } | null)?.ready;
      const result = manager.setReady(located.code, located.playerId, ready);
      reply(ack, result.ok ? { ok: true } : result);
    });

    socket.on("options", (payload: unknown, ack?: unknown) => {
      const located = current(socket);
      if (!located) return reply(ack, { ok: false, error: "Du bist in keinem Vereinsheim." });
      const body = (payload ?? {}) as { turnTimerSeconds?: unknown; sitzeMischen?: unknown; probeMitNpcs?: unknown };
      const result = manager.setOptions(located.code, located.playerId, body);
      reply(ack, result.ok ? { ok: true } : result);
    });

    socket.on("kick", (payload: unknown, ack?: unknown) => {
      const located = current(socket);
      if (!located) return reply(ack, { ok: false, error: "Du bist in keinem Vereinsheim." });
      const targetId = (payload as { playerId?: unknown } | null)?.playerId;
      const result = manager.kick(located.code, located.playerId, targetId);
      if (!result.ok) return reply(ack, result);
      if (result.data.socketId) {
        const target = io.sockets.sockets.get(result.data.socketId);
        target?.emit("kicked", { message: "Der Vorstand hat dich aus dem Vereinsheim gebeten." });
        target?.disconnect(true);
      }
      reply(ack, { ok: true });
    });

    socket.on("start", (_payload: unknown, ack?: unknown) => {
      const located = current(socket);
      if (!located) return reply(ack, { ok: false, error: "Du bist in keinem Vereinsheim." });
      const result = manager.start(located.code, located.playerId);
      reply(ack, result.ok ? { ok: true } : result);
    });

    socket.on("rematch", (_payload: unknown, ack?: unknown) => {
      const located = current(socket);
      if (!located) return reply(ack, { ok: false, error: "Du bist in keinem Vereinsheim." });
      const result = manager.rematch(located.code, located.playerId);
      reply(ack, result.ok ? { ok: true } : result);
    });

    socket.on("leave", (_payload: unknown, ack?: unknown) => {
      const located = current(socket);
      if (!located) return reply(ack, { ok: false, error: "Du bist in keinem Vereinsheim." });
      const result = manager.leave(located.code, located.playerId);
      socket.data.roomCode = undefined;
      socket.data.playerId = undefined;
      socket.leave(located.code);
      reply(ack, result.ok ? { ok: true } : result);
    });

    socket.on("action", (payload: unknown, ack?: unknown) => {
      const located = current(socket);
      if (!located) return reply(ack, { ok: false, error: "Du bist in keinem Vereinsheim." });
      const result = manager.act(located.code, located.playerId, payload);
      reply(ack, result.ok ? { ok: true } : result);
    });

    socket.on("disconnect", () => {
      manager.noteSocketGone(socket.id);
    });
  });

  return { httpServer, io, manager };
}

function current(socket: BoundSocket): { code: string; playerId: string } | null {
  if (!socket.data.roomCode || !socket.data.playerId) return null;
  return { code: socket.data.roomCode, playerId: socket.data.playerId };
}
