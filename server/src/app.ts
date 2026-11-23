import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { Server } from "socket.io";
import type { Ack, ClientState } from "@secret-nils/shared";
import { RoomManager, type ManagerConfig } from "./manager.js";
import { passesPolicyPassword } from "./password.js";
import type { PolicyStore } from "./policy-store.js";

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
  const headers: Record<string, string> = { "Content-Type": MIME[extension] ?? "application/octet-stream" };
  if (extension === ".html") headers["Cache-Control"] = "no-store";
  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 100_000) {
        reject(new Error("zu groß"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("kein json"));
      }
    });
    req.on("error", reject);
  });
}

function handleHttp(req: IncomingMessage, res: ServerResponse, policies?: PolicyStore, policyPassword?: string): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }
  if (url.pathname === "/api/policies") {
    if (!policies) {
      sendJson(res, 503, { error: "Die Beschlussverwaltung ist hier nicht eingeschaltet." });
      return;
    }
    if (req.method === "GET") {
      sendJson(res, 200, { ...policies.view(), geschuetzt: Boolean(policyPassword) });
      return;
    }
    if (req.method === "PUT") {
      void readBody(req)
        .then((body) => {
          const given = body && typeof body === "object" ? (body as { passwort?: unknown }).passwort : undefined;
          if (!passesPolicyPassword(policyPassword, given)) {
            sendJson(res, 401, { error: "Das Satzungspasswort stimmt nicht." });
            return;
          }
          const result = policies.save(body);
          sendJson(res, result.ok ? 200 : 400, result.ok ? { ...result, geschuetzt: Boolean(policyPassword) } : { error: result.error });
        })
        .catch(() => sendJson(res, 400, { error: "Die Vorlagen sind so nicht lesbar." }));
      return;
    }
    sendJson(res, 405, { error: "Diese Anfrage kennt die Satzung nicht." });
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

export function createApp(config: ManagerConfig & { policies?: PolicyStore; policyPassword?: string } = {}) {
  const { policies, policyPassword, ...managerConfig } = config;
  const httpServer = createServer((req, res) => handleHttp(req, res, policies, policyPassword));
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

  manager = new RoomManager({
    ...managerConfig,
    catalog: policies ? () => policies.deck() : managerConfig.catalog,
    onChange: broadcast,
    onClose: closeRoom,
  });

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
      const body = (payload ?? {}) as {
        name?: unknown;
        turnTimerSeconds?: unknown;
        sitzeMischen?: unknown;
        probeMitNpcs?: unknown;
      };
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
