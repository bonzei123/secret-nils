import { randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  applyAction,
  applyTimeout,
  CODE_ALPHABET,
  createGame,
  isClientAction,
  normalizeRoomCode,
  projectView,
  sanitizeName,
  TIMER_CHOICES,
  type Ack,
  type ClientAction,
  type ClientState,
  type GameState,
  type LobbyWire,
  type TimerChoice,
} from "@secret-nils/shared";

export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface ManagerConfig {
  onChange?: (code: string) => void;
  onClose?: (code: string, socketIds: string[]) => void;
  scheduler?: Scheduler;
  now?: () => number;
  lobbyGraceMs?: number;
  emptyRoomMs?: number;
  createCode?: () => string;
  createId?: () => string;
  createToken?: () => string;
  createSeed?: () => number;
}

interface Member {
  id: string;
  name: string;
  token: string;
  socketId: string | null;
  ready: boolean;
  connected: boolean;
}

interface RoomOptions {
  turnTimerSeconds: TimerChoice;
  sitzeMischen: boolean;
}

interface Room {
  code: string;
  hostId: string;
  status: "lobby" | "playing";
  members: Member[];
  options: RoomOptions;
  game: GameState | null;
  timer: unknown | null;
  timerKey: string | null;
  turnDeadline: number | null;
  abandonTimer: unknown | null;
  createdAt: number;
}

export type RoomResult<T> = { ok: true; data: T } | { ok: false; error: string };

const DEFAULT_TIMER: TimerChoice = 90;

function timerKey(game: GameState): string {
  if (game.phase === "game_over") return "over";
  if (game.phase === "briefing") return "briefing";
  if (game.phase === "voting") return `voting:${game.presidentIndex}:${game.nominatedChancellorIndex}`;
  return [
    game.phase,
    game.presidentIndex,
    game.chancellorIndex ?? "-",
    game.pendingPower ?? "-",
    game.specialElectionCallerIndex ?? "-",
    game.electionTracker,
    game.vetoDenied ? 1 : 0,
  ].join(":");
}

function asTimer(value: unknown): TimerChoice | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return (TIMER_CHOICES as readonly number[]).includes(value) ? (value as TimerChoice) : null;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly tokens = new Map<string, { code: string; playerId: string }>();
  private readonly graceTimers = new Map<string, unknown>();
  private readonly scheduler: Scheduler;
  private readonly now: () => number;
  private readonly lobbyGraceMs: number;
  private readonly emptyRoomMs: number;
  private readonly createCode: () => string;
  private readonly createId: () => string;
  private readonly createToken: () => string;
  private readonly createSeed: () => number;
  private readonly onChange?: (code: string) => void;
  private readonly onClose?: (code: string, socketIds: string[]) => void;

  constructor(config: ManagerConfig = {}) {
    this.scheduler = config.scheduler ?? realScheduler;
    this.now = config.now ?? Date.now;
    this.lobbyGraceMs = config.lobbyGraceMs ?? 90_000;
    this.emptyRoomMs = config.emptyRoomMs ?? 10 * 60_000;
    this.createCode = config.createCode ?? (() => this.randomCode());
    this.createId = config.createId ?? (() => randomUUID());
    this.createToken = config.createToken ?? (() => randomBytes(18).toString("hex"));
    this.createSeed = config.createSeed ?? (() => randomInt(1, 2_147_483_646));
    this.onChange = config.onChange;
    this.onClose = config.onClose;
  }

  createRoom(input: { name?: unknown; turnTimerSeconds?: unknown; sitzeMischen?: unknown }): RoomResult<{
    code: string;
    playerId: string;
    token: string;
  }> {
    if (this.rooms.size >= 200) {
      return { ok: false, error: "Gerade sind zu viele Vereinsheime offen. Versuch es in ein paar Minuten noch einmal." };
    }
    const name = sanitizeName(input.name);
    if (!name) return { ok: false, error: "Schreib deinen Namen ins Protokoll: zwei bis zwanzig Zeichen." };
    const turnTimerSeconds = input.turnTimerSeconds === undefined ? DEFAULT_TIMER : asTimer(input.turnTimerSeconds);
    if (!turnTimerSeconds) return { ok: false, error: "Diese Zugzeit steht nicht in der Hausordnung." };
    if (input.sitzeMischen !== undefined && typeof input.sitzeMischen !== "boolean") {
      return { ok: false, error: "Die Sitzordnung ist so nicht lesbar." };
    }
    const code = this.createCode();
    if (this.rooms.has(code)) return { ok: false, error: "Der Raumcode war schon vergeben. Nochmal versuchen." };
    const member = this.makeMember(name);
    const room: Room = {
      code,
      hostId: member.id,
      status: "lobby",
      members: [member],
      options: { turnTimerSeconds, sitzeMischen: input.sitzeMischen === true },
      game: null,
      timer: null,
      timerKey: null,
      turnDeadline: null,
      abandonTimer: null,
      createdAt: this.now(),
    };
    this.rooms.set(code, room);
    this.tokens.set(member.token, { code, playerId: member.id });
    this.touch(code);
    return { ok: true, data: { code, playerId: member.id, token: member.token } };
  }

  joinRoom(rawCode: unknown, rawName: unknown): RoomResult<{ code: string; playerId: string; token: string }> {
    const code = normalizeRoomCode(rawCode);
    if (!code) return { ok: false, error: "Der Raumcode hat vier Zeichen, ohne 0, 1, I und O. Zum Beispiel K7MP." };
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: "Kein Vereinsheim unter diesem Code." };
    if (room.status !== "lobby") return { ok: false, error: "Die Sitzung läuft schon. Nur wer dabei war, kommt mit dem Ausweis wieder rein." };
    if (room.members.length >= 10) return { ok: false, error: "Das Vereinsheim ist voll (10 Mitglieder)." };
    const name = sanitizeName(rawName);
    if (!name) return { ok: false, error: "Schreib deinen Namen ins Protokoll: zwei bis zwanzig Zeichen." };
    if (room.members.some((member) => member.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, error: "Diesen Namen gibt es im Vereinsheim schon." };
    }
    const member = this.makeMember(name);
    room.members.push(member);
    this.tokens.set(member.token, { code, playerId: member.id });
    this.touch(code);
    return { ok: true, data: { code, playerId: member.id, token: member.token } };
  }

  reconnect(token: unknown): RoomResult<{ code: string; playerId: string; token: string }> {
    if (typeof token !== "string" || token.length < 10) {
      return { ok: false, error: "Dieser Ausweis ist ungültig." };
    }
    const located = this.tokens.get(token);
    if (!located) return { ok: false, error: "Diese Sitzung ist abgelaufen." };
    const room = this.rooms.get(located.code);
    const member = room?.members.find((entry) => entry.id === located.playerId);
    if (!room || !member) return { ok: false, error: "Diese Sitzung ist abgelaufen." };
    member.connected = true;
    if (room.status === "lobby") {
      /* Bereit-Status bleibt, wie er war, sobald die Verbindung wieder da ist. */
    }
    this.clearGrace(this.graceKey(room.code, member.id));
    this.armAbandon(room);
    this.touch(room.code);
    return { ok: true, data: { code: room.code, playerId: member.id, token: member.token } };
  }

  attach(code: string, playerId: string, socketId: string): string | null {
    const room = this.rooms.get(code);
    const member = room?.members.find((entry) => entry.id === playerId);
    if (!room || !member) return null;
    const previous = member.socketId;
    member.socketId = socketId;
    member.connected = true;
    this.clearGrace(this.graceKey(code, playerId));
    this.armAbandon(room);
    this.touch(code);
    return previous && previous !== socketId ? previous : null;
  }

  noteSocketGone(socketId: string): void {
    const found = this.findBySocket(socketId);
    if (!found) return;
    if (found.member.socketId !== socketId) return;
    found.member.socketId = null;
    found.member.connected = false;
    if (found.room.status === "lobby") {
      found.member.ready = false;
      this.armGrace(found.room, found.member.id);
    }
    this.armAbandon(found.room);
    this.touch(found.room.code);
  }

  setReady(code: string, playerId: string, ready: unknown): RoomResult<{ ready: boolean }> {
    const room = this.requireMember(code, playerId);
    if (!room.ok) return room;
    if (room.data.room.status !== "lobby") return { ok: false, error: "Die Sitzung läuft schon." };
    if (typeof ready !== "boolean") return { ok: false, error: "Bereit oder nicht — ja oder nein." };
    if (!room.data.member.connected) return { ok: false, error: "Du bist gerade nicht verbunden." };
    room.data.member.ready = ready;
    this.touch(code);
    return { ok: true, data: { ready } };
  }

  setOptions(
    code: string,
    playerId: string,
    input: { turnTimerSeconds?: unknown; sitzeMischen?: unknown },
  ): RoomResult<{ updated: true }> {
    const room = this.requireMember(code, playerId);
    if (!room.ok) return room;
    if (room.data.room.hostId !== playerId) return { ok: false, error: "Nur der Vorstand im Vereinsheim darf das." };
    if (room.data.room.status !== "lobby") return { ok: false, error: "Hausregeln gelten ab der nächsten Sitzung." };
    if (input.turnTimerSeconds !== undefined) {
      const timer = asTimer(input.turnTimerSeconds);
      if (!timer) return { ok: false, error: "Diese Zugzeit steht nicht in der Hausordnung." };
      room.data.room.options.turnTimerSeconds = timer;
    }
    if (input.sitzeMischen !== undefined) {
      if (typeof input.sitzeMischen !== "boolean") return { ok: false, error: "Die Sitzordnung ist so nicht lesbar." };
      room.data.room.options.sitzeMischen = input.sitzeMischen;
    }
    this.touch(code);
    return { ok: true, data: { updated: true } };
  }

  kick(code: string, playerId: string, targetId: unknown): RoomResult<{ socketId: string | null }> {
    const room = this.requireMember(code, playerId);
    if (!room.ok) return room;
    if (room.data.room.hostId !== playerId) return { ok: false, error: "Nur der Vorstand im Vereinsheim darf das." };
    if (room.data.room.status !== "lobby") return { ok: false, error: "Während der Sitzung gilt die Satzung, kein Rauswurf per Knopf." };
    if (typeof targetId !== "string" || targetId === playerId) {
      return { ok: false, error: "Dieses Mitglied kannst du so nicht bitten zu gehen." };
    }
    const target = room.data.room.members.find((member) => member.id === targetId);
    if (!target) return { ok: false, error: "Dieses Mitglied sitzt hier nicht." };
    const socketId = target.socketId;
    this.removeMember(room.data.room, target.id);
    return { ok: true, data: { socketId } };
  }

  leave(code: string, playerId: string): RoomResult<{ socketId: string | null; removed: boolean }> {
    const room = this.requireMember(code, playerId);
    if (!room.ok) return room;
    const socketId = room.data.member.socketId;
    if (room.data.room.status === "lobby") {
      this.removeMember(room.data.room, playerId);
      return { ok: true, data: { socketId, removed: true } };
    }
    room.data.member.socketId = null;
    room.data.member.connected = false;
    this.armAbandon(room.data.room);
    this.touch(code);
    return { ok: true, data: { socketId, removed: false } };
  }

  start(code: string, playerId: string): RoomResult<{ started: true }> {
    const room = this.requireMember(code, playerId);
    if (!room.ok) return room;
    if (room.data.room.hostId !== playerId) return { ok: false, error: "Nur der Vorstand im Vereinsheim darf die Sitzung eröffnen." };
    if (room.data.room.status !== "lobby") return { ok: false, error: "Die Sitzung läuft schon." };
    const reason = this.blockReason(room.data.room);
    if (reason) return { ok: false, error: reason };
    try {
      room.data.room.game = createGame(
        room.data.room.members.map((member) => ({ id: member.id, name: member.name })),
        { seed: this.createSeed(), sitzeMischen: room.data.room.options.sitzeMischen },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Die Sitzung konnte nicht eröffnet werden.";
      return { ok: false, error: message };
    }
    room.data.room.status = "playing";
    for (const member of room.data.room.members) this.clearGrace(this.graceKey(code, member.id));
    this.schedule(room.data.room, null);
    this.touch(code);
    return { ok: true, data: { started: true } };
  }

  rematch(code: string, playerId: string): RoomResult<{ rematch: true }> {
    const room = this.requireMember(code, playerId);
    if (!room.ok) return room;
    if (room.data.room.hostId !== playerId) return { ok: false, error: "Nur der Vorstand im Vereinsheim darf neu aufsetzen." };
    if (!room.data.room.game || room.data.room.game.phase !== "game_over") {
      return { ok: false, error: "Eine neue Sitzung gibt es erst, wenn diese beendet ist." };
    }
    this.clearTurn(room.data.room);
    room.data.room.game = null;
    room.data.room.status = "lobby";
    room.data.room.timerKey = null;
    room.data.room.turnDeadline = null;
    for (const member of room.data.room.members) member.ready = false;
    this.touch(code);
    return { ok: true, data: { rematch: true } };
  }

  act(code: string, playerId: string, action: unknown): RoomResult<{ applied: true }> {
    const room = this.requireMember(code, playerId);
    if (!room.ok) return room;
    if (!room.data.room.game || room.data.room.status !== "playing") {
      return { ok: false, error: "Die Sitzung hat noch nicht begonnen." };
    }
    if (!isClientAction(action)) return { ok: false, error: "Unverständliche Aktion." };
    const previous = room.data.room.timerKey;
    const result = applyAction(room.data.room.game, { ...action, playerId } as ClientAction & { playerId: string });
    if (!result.ok) return { ok: false, error: result.error };
    room.data.room.game = result.state;
    this.schedule(room.data.room, previous);
    this.touch(code);
    return { ok: true, data: { applied: true } };
  }

  viewFor(code: string, playerId: string): ClientState | null {
    const room = this.rooms.get(code);
    const member = room?.members.find((entry) => entry.id === playerId);
    if (!room || !member) return null;
    const connected = Object.fromEntries(room.members.map((entry) => [entry.id, entry.connected]));
    const game = room.game ? projectView(room.game, playerId, connected) : null;
    const secondsTotal = room.options.turnTimerSeconds;
    const secondsLeft =
      game && room.turnDeadline && game.phase !== "game_over"
        ? Math.max(0, Math.ceil((room.turnDeadline - this.now()) / 1000))
        : null;
    return {
      lobby: this.lobbyWire(room, playerId),
      game: game ? { ...game, turnSecondsLeft: secondsLeft, turnSecondsTotal: secondsTotal } : null,
    };
  }

  /** Nur für Tests. Wird von keiner Socket-Strecke benutzt. */
  debugGame(code: string): GameState | null {
    return this.rooms.get(code)?.game ?? null;
  }

  memberSocketIds(code: string): { id: string; socketId: string | null }[] {
    return (this.rooms.get(code)?.members ?? []).map((member) => ({ id: member.id, socketId: member.socketId }));
  }

  hasRoom(code: string): boolean {
    return this.rooms.has(code);
  }

  private lobbyWire(room: Room, playerId: string): LobbyWire {
    const blockReason = room.status === "lobby" ? this.blockReason(room) : null;
    return {
      code: room.code,
      status: room.status,
      youId: playerId,
      hostId: room.hostId,
      players: room.members.map((member, seat) => ({
        id: member.id,
        name: member.name,
        seat,
        ready: member.ready,
        connected: member.connected,
        isHost: member.id === room.hostId,
        isYou: member.id === playerId,
      })),
      options: { ...room.options },
      canStart: room.status === "lobby" && blockReason === null && room.hostId === playerId,
      blockReason,
      timerChoices: TIMER_CHOICES,
    };
  }

  private blockReason(room: Room): string | null {
    if (room.members.length < 5) return "Mindestens 5 Mitglieder, höchstens 10.";
    if (room.members.length > 10) return "Höchstens 10 Mitglieder.";
    if (room.members.some((member) => !member.connected)) return "Jemand ist gerade nicht verbunden.";
    if (room.members.some((member) => !member.ready)) return "Noch nicht alle haben bereit gemeldet.";
    return null;
  }

  private makeMember(name: string): Member {
    return {
      id: this.createId(),
      name,
      token: this.createToken(),
      socketId: null,
      ready: false,
      connected: true,
    };
  }

  private requireMember(code: string, playerId: string): RoomResult<{ room: Room; member: Member }> {
    const room = this.rooms.get(code);
    const member = room?.members.find((entry) => entry.id === playerId);
    if (!room || !member) return { ok: false, error: "Du sitzt in diesem Vereinsheim nicht (mehr)." };
    return { ok: true, data: { room, member } };
  }

  private findBySocket(socketId: string): { room: Room; member: Member } | null {
    for (const room of this.rooms.values()) {
      const member = room.members.find((entry) => entry.socketId === socketId);
      if (member) return { room, member };
    }
    return null;
  }

  private removeMember(room: Room, playerId: string): void {
    const index = room.members.findIndex((member) => member.id === playerId);
    if (index < 0) return;
    const removed = room.members[index];
    if (!removed) return;
    room.members.splice(index, 1);
    this.tokens.delete(removed.token);
    this.clearGrace(this.graceKey(room.code, removed.id));
    if (room.members.length === 0) {
      this.clearTurn(room);
      this.clearAbandon(room);
      this.rooms.delete(room.code);
      this.onClose?.(room.code, removed.socketId ? [removed.socketId] : []);
      return;
    }
    if (room.hostId === removed.id) room.hostId = room.members[0]!.id;
    this.touch(room.code);
  }

  private schedule(room: Room, previousKey: string | null): void {
    if (room.status !== "playing" || !room.game || room.game.phase === "game_over") {
      this.clearTurn(room);
      room.turnDeadline = null;
      room.timerKey = null;
      return;
    }
    const key = timerKey(room.game);
    if (previousKey === key && room.timer) return;
    this.clearTurn(room);
    const ms = room.options.turnTimerSeconds * 1000;
    room.turnDeadline = this.now() + ms;
    room.timerKey = key;
    room.timer = this.scheduler.set(() => this.fire(room.code), ms);
  }

  private fire(code: string): void {
    const room = this.rooms.get(code);
    if (!room?.game || room.status !== "playing") return;
    room.timer = null;
    const previous = room.timerKey;
    const result = applyTimeout(room.game);
    if (result.ok) room.game = result.state;
    this.schedule(room, previous);
    this.touch(code);
  }

  private armGrace(room: Room, playerId: string): void {
    const key = this.graceKey(room.code, playerId);
    this.clearGrace(key);
    const handle = this.scheduler.set(() => {
      this.graceTimers.delete(key);
      const current = this.rooms.get(room.code);
      const member = current?.members.find((entry) => entry.id === playerId);
      if (!current || current.status !== "lobby" || !member || member.connected) return;
      this.removeMember(current, playerId);
    }, this.lobbyGraceMs);
    this.graceTimers.set(key, handle);
  }

  private armAbandon(room: Room): void {
    if (room.members.some((member) => member.connected)) {
      this.clearAbandon(room);
      return;
    }
    if (room.abandonTimer) return;
    room.abandonTimer = this.scheduler.set(() => {
      room.abandonTimer = null;
      const current = this.rooms.get(room.code);
      if (!current) return;
      if (current.members.some((member) => member.connected)) return;
      this.destroy(current);
    }, this.emptyRoomMs);
  }

  private destroy(room: Room): void {
    this.clearTurn(room);
    this.clearAbandon(room);
    const sockets = room.members.map((member) => member.socketId).filter((id): id is string => Boolean(id));
    for (const member of room.members) {
      this.tokens.delete(member.token);
      this.clearGrace(this.graceKey(room.code, member.id));
    }
    this.rooms.delete(room.code);
    this.onClose?.(room.code, sockets);
  }

  private clearTurn(room: Room): void {
    if (room.timer) this.scheduler.clear(room.timer);
    room.timer = null;
  }

  private clearAbandon(room: Room): void {
    if (room.abandonTimer) this.scheduler.clear(room.abandonTimer);
    room.abandonTimer = null;
  }

  private clearGrace(key: string): void {
    const handle = this.graceTimers.get(key);
    if (handle) this.scheduler.clear(handle);
    this.graceTimers.delete(key);
  }

  private graceKey(code: string, playerId: string): string {
    return `${code}:${playerId}`;
  }

  private touch(code: string): void {
    if (this.rooms.has(code)) this.onChange?.(code);
  }

  private randomCode(): string {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      let code = "";
      for (let index = 0; index < 4; index += 1) {
        code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)] ?? "A";
      }
      if (!this.rooms.has(code)) return code;
    }
    let code = "";
    for (let index = 0; index < 4; index += 1) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)] ?? "M";
    }
    return code;
  }
}

export function ackError(error: string): Ack {
  return { ok: false, error };
}
